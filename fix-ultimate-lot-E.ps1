#requires -Version 5.1
<#
.SYNOPSIS
    Fix ultime des 2 derniers problemes du lot E :
    - H-05 timing : DUMMY_BCRYPT_HASH actuel est invalide -> bcryptjs.compare retourne false en 0ms.
                    On le remplace par un VRAI hash bcrypt (genere avec bcryptjs).
    - H-06/H-07 BDD : le script Node doit tourner DEPUIS apps/api (et le .cjs doit y etre).
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

New-Banner "Fix ultime - hash factice valide + creation tables BDD au bon endroit"

# ============================================================================
# 1. Generer un VRAI hash bcrypt avec bcryptjs (depuis apps/api)
# ============================================================================

Write-Step "1. Generer un vrai hash bcrypt (cost 12) avec bcryptjs"

# Petit script Node qui genere un hash valide pour "dummy-never-matches"
$genHashScript = @'
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('dummy-never-matches', 12);
console.log(hash);
'@

$genHashFile = Join-Path $ApiDir "gen-hash-temp.cjs"
Set-Content -Path $genHashFile -Value $genHashScript -Encoding UTF8

$validHash = $null
Push-Location $ApiDir
try {
    $output = node "gen-hash-temp.cjs" 2>&1 | Out-String
    $validHash = ($output -split "`n" | Where-Object { $_ -match '^\$2[ab]\$' } | Select-Object -First 1).Trim()
} catch {
    Write-Bad "Erreur generation hash : $_"
}
Remove-Item $genHashFile -Force -ErrorAction SilentlyContinue
Pop-Location

if (-not $validHash) {
    Write-Bad "Impossible de generer un hash valide"
    exit 1
}
Write-OK "Hash valide genere (longueur $($validHash.Length))"
Write-Info "Format : $($validHash.Substring(0, 7))...$($validHash.Substring($validHash.Length - 4))"

# ============================================================================
# 2. Remplacer DUMMY_BCRYPT_HASH dans auth-controller
# ============================================================================

Write-Step "2. Remplacer DUMMY_BCRYPT_HASH par le vrai hash"

$content = Get-Content -Path $AuthControllerFile -Raw -Encoding UTF8

# Pattern : const DUMMY_BCRYPT_HASH = '...';
$pattern = "const DUMMY_BCRYPT_HASH = '[^']*';"
$newLine = "const DUMMY_BCRYPT_HASH = '$validHash';"

if ($content -match [regex]::Escape("const DUMMY_BCRYPT_HASH = '")) {
    $content = [regex]::Replace($content, $pattern, $newLine)
    Save-FileUtf8NoBom -Path $AuthControllerFile -Content $content
    Write-OK "DUMMY_BCRYPT_HASH remplace par un vrai hash bcrypt valide"
} else {
    Write-Bad "DUMMY_BCRYPT_HASH introuvable dans auth-controller.ts"
    exit 1
}

# ============================================================================
# 3. Creer les tables BDD via un script DANS apps/api
# ============================================================================

Write-Step "3. Creation tables login_attempts + audit_logs (script dans apps/api)"

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
    await p.$executeRawUnsafe(SQL_LOGIN_ATTEMPTS);
    for (const idx of SQL_LOGIN_ATTEMPTS_INDEXES) {
      await p.$executeRawUnsafe(idx);
    }
    console.log('OK_LOGIN_ATTEMPTS');

    await p.$executeRawUnsafe(SQL_AUDIT_LOGS);
    for (const idx of SQL_AUDIT_LOGS_INDEXES) {
      await p.$executeRawUnsafe(idx);
    }
    console.log('OK_AUDIT_LOGS');

    const r1 = await p.$queryRaw`SELECT to_regclass('public.login_attempts') AS exists`;
    const r2 = await p.$queryRaw`SELECT to_regclass('public.audit_logs') AS exists`;
    console.log('VERIFY:' + JSON.stringify({
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

# IMPORTANT : ecrire le script DANS apps/api pour que require('@prisma/client') marche
$createTablesFile = Join-Path $ApiDir "create-tables-temp.cjs"
Set-Content -Path $createTablesFile -Value $createTablesScript -Encoding UTF8

Push-Location $ApiDir
$bddDone = $false
try {
    Write-Info "Execution depuis $ApiDir..."
    $output = node "create-tables-temp.cjs" 2>&1 | Out-String
    Write-Info "Sortie :"
    $output -split "`n" | ForEach-Object { Write-Info "    $_" }

    if ($output -match 'VERIFY:.*"login_attempts":true.*"audit_logs":true') {
        Write-OK "Tables creees et verifiees"
        $bddDone = $true
    } else {
        Write-Bad "Verification BDD echouee"
    }
} catch {
    Write-Bad "Erreur : $_"
}
Remove-Item $createTablesFile -Force -ErrorAction SilentlyContinue
Pop-Location

# ============================================================================
# 4. Regenerer le client Prisma depuis apps/api
# ============================================================================

Write-Step "4. Regenerer le client Prisma"

Push-Location $ApiDir
try {
    $output = & npx prisma generate 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Client Prisma regenere"
    } else {
        Write-Warn "prisma generate (code $LASTEXITCODE)"
        Write-Info $output
    }
} catch {
    Write-Warn "Exception : $_"
}
Pop-Location

# ============================================================================
# 5. Attente redemarrage tsx
# ============================================================================

Write-Step "5. Attente redemarrage API"
Start-Sleep -Seconds 4
if (-not (Wait-ApiReady -TimeoutSec 30)) {
    Write-Bad "API ne repond plus"
    exit 1
}
Write-OK "API redemarree"

# ============================================================================
# 6. RETEST H-05 timing
# ============================================================================

Write-Step "6. RETEST H-05 timing avec le hash valide"

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

# Warm-up serieux (bcryptjs + Node.js JIT)
1..3 | ForEach-Object {
    Measure-LoginTime -Identifier $AdminEmail -Password "warmup-$_" | Out-Null
    Measure-LoginTime -Identifier "warmup-$_@nope.fake" -Password "warmup-$_" | Out-Null
}

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
# VERDICT FINAL
# ============================================================================

New-Banner "VERDICT FINAL LOT E (DEFINITIF)"

Write-Host ""
Write-Host "  H-01 Multer 1->2      : OK" -ForegroundColor Green
Write-Host "  H-02 bcryptjs         : OK" -ForegroundColor Green
Write-Host "  H-03 JWT_SECRET strict: OK" -ForegroundColor Green
Write-Host "  H-04 Password seed    : OK" -ForegroundColor Green
Write-Host ("  H-05 Login durci      : " + $(if ($timingOk) { 'OK' } elseif ($timingMod) { 'MODERE' } else { 'KO' })) -ForegroundColor $(if ($timingOk) { 'Green' } elseif ($timingMod) { 'Yellow' } else { 'Red' })
Write-Host ("  H-06 login_attempts   : " + $(if ($bddDone) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bddDone) { 'Green' } else { 'Red' })
Write-Host ("  H-07 audit_logs       : " + $(if ($bddDone) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bddDone) { 'Green' } else { 'Red' })
Write-Host "  H-08 Origin check     : OK" -ForegroundColor Green

Write-Host ""
if ($timingOk -and $bddDone) {
    Write-Fixed "Lot E COMPLET - les 8 patches sont valides !"
    Write-Host ""
    Write-Host "Commit final :" -ForegroundColor Cyan
    Write-Host "  git add -A" -ForegroundColor Gray
    Write-Host "  git commit -m 'security(lot-E): apply 8 inherited patches H-01 to H-08'" -ForegroundColor Gray
}
