#requires -Version 5.1
<#
.SYNOPSIS
    Fix final du lot E : H-05 timing (approche line-by-line) + tables BDD
    H-06/H-07 (creees directement en SQL pour eviter le conflit Prisma).
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)   { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Warn($msg)  { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Fixed($msg) { Write-Host "  >>> FIX VERIFIE : $msg" -ForegroundColor Green -BackgroundColor DarkGreen }

function New-Banner($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Save-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Wait-ApiReady {
    param([int]$TimeoutSec = 25)
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
        Start-Sleep -Seconds 1
        try {
            $h = Invoke-WebRequest -Uri "$ApiUrl/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($h.StatusCode -eq 200) { return $true }
        } catch { }
    }
    return $false
}

$ApiDir = Join-Path $RepoRoot 'apps\api'
$AuthControllerFile = Join-Path $ApiDir 'src\controllers\auth-controller.ts'

New-Banner "Fix final lot E - H-05 timing + tables BDD"

# ============================================================================
# 1. FIX H-05 timing - approche line-by-line
# ============================================================================

Write-Step "1. FIX H-05 timing - patch line-by-line"

$lines = Get-Content -Path $AuthControllerFile -Encoding UTF8
$alreadyPatched = $false
$found = @{
    findUserCall = -1
    firstThrow   = -1
    verifyCall   = -1
    secondThrow  = -1
}

# Cherche les indices des lignes critiques
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    if ($line -match '^\s+const hashToCheck = user\?\.passwordHash') {
        $alreadyPatched = $true
        break
    }
    if ($line -match '^\s+const user = await findUserByIdentifier\(identifier\);') {
        $found.findUserCall = $i
    }
    if ($found.findUserCall -ge 0 -and $found.firstThrow -lt 0 -and
        $line -match "throw new AppError\(401, 'Identifiant ou mot de passe incorrect'") {
        $found.firstThrow = $i
    }
    if ($found.firstThrow -ge 0 -and $found.verifyCall -lt 0 -and
        $line -match '^\s+const valid = await verifyPassword\(password, user\.passwordHash\);') {
        $found.verifyCall = $i
    }
    if ($found.verifyCall -ge 0 -and $found.secondThrow -lt 0 -and
        $line -match "throw new AppError\(401, 'Identifiant ou mot de passe incorrect'") {
        $found.secondThrow = $i
    }
}

if ($alreadyPatched) {
    Write-OK "Patch deja en place (hashToCheck present)"
    $hx05Done = $true
} elseif ($found.findUserCall -ge 0 -and $found.verifyCall -ge 0 -and $found.secondThrow -ge 0) {
    Write-Info "Lignes critiques trouvees :"
    Write-Info "  findUserCall : ligne $($found.findUserCall + 1)"
    Write-Info "  firstThrow   : ligne $($found.firstThrow + 1)"
    Write-Info "  verifyCall   : ligne $($found.verifyCall + 1)"
    Write-Info "  secondThrow  : ligne $($found.secondThrow + 1)"

    # Reconstruction : on garde les lignes 0..findUserCall, puis on reecrit le reste
    # jusqu'a la ligne d'apres secondThrow + le bloc fermant
    $newLines = @()

    # Lignes 0 a findUserCall (incluse)
    for ($i = 0; $i -le $found.findUserCall; $i++) {
        $newLines += $lines[$i]
    }

    # Ligne vide
    $newLines += ''

    # Notre bloc patch
    $indent = ($lines[$found.findUserCall] -replace '\S.*', '')

    $newLines += "$indent// [Patch H-05] Anti-timing : on hash toujours, meme si user inexistant"
    $newLines += "${indent}const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;"
    $newLines += "${indent}const valid = await verifyPassword(password, hashToCheck);"
    $newLines += ''
    $newLines += "${indent}if (!user || !user.isActive || !valid) {"

    # Indentation du throw (plus profond)
    $throwIndent = ($lines[$found.firstThrow] -replace '\S.*', '')
    $newLines += "${throwIndent}throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');"
    $newLines += "${indent}}"

    # Lignes apres le secondThrow + sa ligne fermante "}"
    # On cherche la ligne "}" qui ferme le 2e if
    $skipUntil = $found.secondThrow + 1
    while ($skipUntil -lt $lines.Count -and $lines[$skipUntil].Trim() -ne '}') {
        $skipUntil++
    }
    $skipUntil++  # passer le } de fin de if

    # Ajouter le reste
    for ($i = $skipUntil; $i -lt $lines.Count; $i++) {
        $newLines += $lines[$i]
    }

    $finalContent = ($newLines -join "`r`n")
    if (-not $finalContent.EndsWith("`r`n")) { $finalContent += "`r`n" }

    Save-FileUtf8NoBom -Path $AuthControllerFile -Content $finalContent
    Write-OK "Patch H-05 applique (line-by-line)"
    $hx05Done = $true
} else {
    Write-Bad "Lignes critiques pas toutes trouvees"
    Write-Info "  findUserCall = $($found.findUserCall)"
    Write-Info "  verifyCall = $($found.verifyCall)"
    Write-Info "  secondThrow = $($found.secondThrow)"
    $hx05Done = $false
}

# ============================================================================
# 2. CREATION DIRECTE des tables BDD (sans prisma migrate)
# ============================================================================

Write-Step "2. Creation directe des tables BDD H-06 + H-07"

# On utilise un script Node qui execute le SQL directement via prisma client
$createTablesScript = @'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const SQL_LOGIN_ATTEMPTS = `
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attempt_key" VARCHAR(64) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "first_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blocked_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
`;

const SQL_LOGIN_ATTEMPTS_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "login_attempts_attempt_key_key" ON "login_attempts"("attempt_key");`,
  `CREATE INDEX IF NOT EXISTS "login_attempts_attempt_key_idx" ON "login_attempts"("attempt_key");`,
  `CREATE INDEX IF NOT EXISTS "login_attempts_blocked_until_idx" ON "login_attempts"("blocked_until");`,
];

const SQL_AUDIT_LOGS = `
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "action" VARCHAR(100) NOT NULL,
  "resource" VARCHAR(255),
  "ip_hash" VARCHAR(64),
  "user_agent" VARCHAR(500),
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
`;

const SQL_AUDIT_LOGS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs"("user_id");`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);`,
];

async function run() {
  try {
    console.log('-- Creating login_attempts...');
    await p.$executeRawUnsafe(SQL_LOGIN_ATTEMPTS);
    for (const idx of SQL_LOGIN_ATTEMPTS_INDEXES) {
      await p.$executeRawUnsafe(idx);
    }
    console.log('OK login_attempts');

    console.log('-- Creating audit_logs...');
    await p.$executeRawUnsafe(SQL_AUDIT_LOGS);
    for (const idx of SQL_AUDIT_LOGS_INDEXES) {
      await p.$executeRawUnsafe(idx);
    }
    console.log('OK audit_logs');

    // Verification
    const r1 = await p.$queryRaw`SELECT to_regclass('public.login_attempts') AS exists`;
    const r2 = await p.$queryRaw`SELECT to_regclass('public.audit_logs') AS exists`;
    console.log('VERIFY ' + JSON.stringify({
      login_attempts: r1[0].exists !== null,
      audit_logs: r2[0].exists !== null,
    }));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}
run();
'@

$createTablesFile = Join-Path $env:TEMP "create-tables-$(Get-Random).cjs"
Set-Content -Path $createTablesFile -Value $createTablesScript -Encoding UTF8

Push-Location $ApiDir
try {
    Write-Info "Execution du script de creation des tables..."
    $output = node $createTablesFile 2>&1 | Out-String
    Write-Info $output
    Remove-Item $createTablesFile -Force -ErrorAction SilentlyContinue

    if ($output -match 'VERIFY .*"login_attempts":true.*"audit_logs":true') {
        Write-OK "Tables login_attempts et audit_logs creees"
        $bddDone = $true
    } else {
        Write-Bad "Verification BDD echouee"
        $bddDone = $false
    }
} catch {
    Write-Bad "Erreur execution : $_"
    $bddDone = $false
}
Pop-Location

# ============================================================================
# 3. Regenerer le client Prisma pour qu'il connaisse les nouveaux modeles
# ============================================================================

Write-Step "3. Regenerer le client Prisma"

Push-Location $ApiDir
try {
    Write-Info "pnpm --filter api prisma:generate..."
    & pnpm --filter api prisma:generate 2>&1 | Out-String | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Client Prisma regenere"
    } else {
        Write-Warn "prisma:generate a possiblement echoue (code $LASTEXITCODE)"
    }
} catch {
    Write-Warn "Exception : $_"
}
Pop-Location

# ============================================================================
# 4. Attente redemarrage tsx
# ============================================================================

Write-Step "4. Attente redemarrage API"
Start-Sleep -Seconds 4
if (-not (Wait-ApiReady -TimeoutSec 30)) {
    Write-Bad "API ne repond plus"
    Write-Info "Verifie le terminal pnpm dev"
    exit 1
}
Write-OK "API redemarree"

# ============================================================================
# 5. RETEST H-05 timing
# ============================================================================

Write-Step "5. RETEST H-05 timing"

function Measure-LoginTime {
    param([string]$Identifier, [string]$Password)
    $body = @{ identifier = $Identifier; password = $Password } | ConvertTo-Json -Compress
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
            -Method POST -ContentType 'application/json' -Body $body `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    } catch { }
    $sw.Stop()
    return $sw.ElapsedMilliseconds
}

# Warm-up
Measure-LoginTime -Identifier $AdminEmail -Password "warmup1" | Out-Null
Measure-LoginTime -Identifier "warmup@nope.fake" -Password "warmup2" | Out-Null

$existingTimes = @()
$nonExistTimes = @()
for ($i = 1; $i -le 5; $i++) {
    $existingTimes += Measure-LoginTime -Identifier $AdminEmail -Password "wrongpwd-$i"
    $nonExistTimes += Measure-LoginTime -Identifier "nobody-$i@nowhere.fake" -Password "any-pwd-$i"
}

$avgExist = ($existingTimes | Measure-Object -Average).Average
$avgNoExist = ($nonExistTimes | Measure-Object -Average).Average
$diff = [Math]::Abs($avgExist - $avgNoExist)

Write-Info "  User existant   : ~$([Math]::Round($avgExist)) ms"
Write-Info "  User inexistant : ~$([Math]::Round($avgNoExist)) ms"
Write-Info "  Difference      : $([Math]::Round($diff)) ms"

$timingOk = $diff -lt 50
$timingMod = $diff -lt 100

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT FINAL"

Write-Host ""
Write-Host ("  H-05 anti-timing      : " + $(if ($timingOk) { 'OK' } elseif ($timingMod) { 'MODERE' } else { 'KO' })) -ForegroundColor $(if ($timingOk) { 'Green' } elseif ($timingMod) { 'Yellow' } else { 'Red' })
Write-Host ("  H-06 login_attempts   : " + $(if ($bddDone) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bddDone) { 'Green' } else { 'Red' })
Write-Host ("  H-07 audit_logs       : " + $(if ($bddDone) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bddDone) { 'Green' } else { 'Red' })
Write-Host "  H-08 origin check     : OK (deja confirme)" -ForegroundColor Green

Write-Host ""
if ($timingOk -and $bddDone) {
    Write-Fixed "Lot E complet - 8 patches valides"
    Write-Host ""
    Write-Host "Commit suggere :" -ForegroundColor Cyan
    Write-Host "  git add -A" -ForegroundColor Gray
    Write-Host "  git commit -m 'security(lot-E): apply 8 inherited patches H-01..H-08'" -ForegroundColor Gray
}
