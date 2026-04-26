#requires -Version 5.1
<#
.SYNOPSIS
    Diagnostic + correction des 3 problemes restants du lot E.

.DESCRIPTION
    1. Diagnostique pourquoi H-05 timing fait 104ms d'ecart (user inexistant a ~1ms)
    2. Corrige H-08 (app.use bloc introuvable) avec une approche plus souple
    3. Verifie si la migration Prisma a vraiment cree les tables login_attempts et audit_logs
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
$AppTsFile = Join-Path $ApiDir 'src\app.ts'

New-Banner "Diag + fix H-05 timing + H-08 + migration BDD"

# ============================================================================
# DIAG H-05 - regarder le code reel d'auth-controller
# ============================================================================

Write-Step "1. DIAG H-05 - inspection auth-controller.ts"

$content = Get-Content -Path $AuthControllerFile -Raw -Encoding UTF8

if ($content.Contains('DUMMY_BCRYPT_HASH')) {
    Write-OK "DUMMY_BCRYPT_HASH present dans le fichier"
} else {
    Write-Bad "DUMMY_BCRYPT_HASH absent - le patch H-05 n'a pas modifie le fichier"
}

# Verifier que findUserByIdentifier est bien la nouvelle version
if ($content -match "if \(!trimmed\.includes\('@'\)\) \{\s*return null;\s*\}") {
    Write-OK "findUserByIdentifier modifiee (retourne null si pas de @)"
} else {
    Write-Bad "findUserByIdentifier pas modifiee"
}

# Verifier que login utilise hashToCheck
if ($content -match 'hashToCheck = user\?\.passwordHash \?\? DUMMY_BCRYPT_HASH') {
    Write-OK "login utilise bien le hash factice anti-timing"
} else {
    Write-Bad "login N'UTILISE PAS le hash factice"
    Write-Info "C'est probablement la cause du timing 1ms vs 105ms"
    Write-Info "Affichage du bloc login actuel :"

    $loginMatch = [regex]::Match($content, "(?s)export async function login.*?(?=\nexport function logout)")
    if ($loginMatch.Success) {
        Write-Host ("-" * 60) -ForegroundColor Yellow
        Write-Host $loginMatch.Value -ForegroundColor Yellow
        Write-Host ("-" * 60) -ForegroundColor Yellow
    }
}

# ============================================================================
# FIX H-05 - reapplique le patch login si necessaire
# ============================================================================

Write-Step "2. FIX H-05 - reapplique le patch login (si necessaire)"

if ($content -match 'hashToCheck = user\?\.passwordHash \?\? DUMMY_BCRYPT_HASH') {
    Write-Info "Patch deja en place, skip"
    $hx05NeedsFix = $false
} else {
    # On recherche le bloc login actuel et on le remplace.
    # Pattern souple : trouve le bloc avec findUserByIdentifier puis verifyPassword
    $oldBlock = @"
    const user = await findUserByIdentifier(identifier);

    if (!user || !user.isActive) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
"@

    $newBlock = @"
    const user = await findUserByIdentifier(identifier);

    // [Patch H-05] Anti-timing : on hash toujours, meme si user inexistant
    const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await verifyPassword(password, hashToCheck);

    if (!user || !user.isActive || !valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
"@

    if ($content.Contains($oldBlock)) {
        $content = $content.Replace($oldBlock, $newBlock)
        Save-FileUtf8NoBom -Path $AuthControllerFile -Content $content
        Write-OK "Patch login applique"
        $hx05NeedsFix = $true
    } else {
        Write-Bad "Bloc login original introuvable - le fichier a un format different"
        Write-Info "Patch manuel necessaire (voir HX-05 dans la doc)"
        $hx05NeedsFix = $false
    }
}

# ============================================================================
# DIAG H-08 - regarder app.ts
# ============================================================================

Write-Step "3. DIAG H-08 - inspection app.ts"

$appContent = Get-Content -Path $AppTsFile -Raw -Encoding UTF8

if ($appContent.Contains('originCheck')) {
    Write-OK "originCheck deja importe dans app.ts"
    $hx08NeedsFix = $false
} else {
    Write-Bad "originCheck PAS dans app.ts"

    # Cherche la ligne app.use avec apiRouter (n'importe quel format)
    $matches = [regex]::Matches($appContent, "app\.use\s*\(\s*'/api/v1'\s*,\s*(\w+)\s*\)")
    if ($matches.Count -gt 0) {
        Write-Info "Lignes app.use('/api/v1', ...) trouvees :"
        foreach ($m in $matches) {
            Write-Info "  -> $($m.Value)"
        }
    } else {
        Write-Bad "Aucune ligne app.use('/api/v1', ...) trouvee !"
    }

    $hx08NeedsFix = $true
}

# ============================================================================
# FIX H-08 - approche souple
# ============================================================================

if ($hx08NeedsFix) {
    Write-Step "4. FIX H-08 - approche souple (insert avant apiRouter)"

    # Etape 1 : import (chercher la derniere ligne d'import et inserer apres)
    if ($appContent -match "(import \{ optionalAuth \} from './middlewares/optional-auth';)") {
        $oldImport = $matches[1]
        $newImport = $oldImport + "`r`nimport { originCheck } from './middlewares/origin-check';"
        $appContent = $appContent.Replace($oldImport, $newImport)
        Write-OK "Import originCheck ajoute"
    } else {
        Write-Warn "Import optionalAuth introuvable - import originCheck non ajoute"
    }

    # Etape 2 : trouver la ligne 'app.use("/api/v1", apiRouter)' et inserer originCheck juste avant
    $regex = [regex]"(?m)^(\s*)(app\.use\s*\(\s*'/api/v1'\s*,\s*apiRouter\s*\)\s*;)"
    $match = $regex.Match($appContent)

    if ($match.Success) {
        $indent = $match.Groups[1].Value
        $original = $match.Value
        $replacement = "${indent}app.use('/api/v1', originCheck);`r`n${original}"
        $appContent = $appContent.Replace($original, $replacement)
        Save-FileUtf8NoBom -Path $AppTsFile -Content $appContent
        Write-OK "originCheck applique avant apiRouter dans app.ts"
    } else {
        Write-Bad "Ligne app.use('/api/v1', apiRouter) introuvable"
        Write-Info "Affiche le contenu de app.ts pour patch manuel :"
        Write-Host $appContent -ForegroundColor Yellow
    }
}

# ============================================================================
# DIAG migration BDD
# ============================================================================

Write-Step "5. DIAG migration Prisma - les tables existent-elles ?"

# On utilise prisma client via un petit script Node pour verifier
$verifyScript = @'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  try {
    const r1 = await p.$queryRaw`SELECT to_regclass('public.login_attempts') AS exists`;
    const r2 = await p.$queryRaw`SELECT to_regclass('public.audit_logs') AS exists`;
    console.log(JSON.stringify({
      login_attempts: r1[0].exists !== null,
      audit_logs: r2[0].exists !== null,
    }));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  } finally {
    await p.$disconnect();
  }
}
check();
'@

$verifyFile = Join-Path $env:TEMP "verify-bdd-$(Get-Random).cjs"
Set-Content -Path $verifyFile -Value $verifyScript -Encoding UTF8

Push-Location $ApiDir
try {
    $output = node $verifyFile 2>&1 | Out-String
    Remove-Item $verifyFile -Force -ErrorAction SilentlyContinue

    $lastLine = ($output -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1).Trim()

    if ($lastLine) {
        try {
            $bdd = $lastLine | ConvertFrom-Json
            if ($bdd.error) {
                Write-Bad "Erreur lors du check BDD : $($bdd.error)"
                Write-Info "La migration n'a probablement pas ete executee"
                $bddNeedsFix = $true
            } else {
                if ($bdd.login_attempts) {
                    Write-OK "Table login_attempts existe"
                } else {
                    Write-Bad "Table login_attempts MANQUANTE"
                }
                if ($bdd.audit_logs) {
                    Write-OK "Table audit_logs existe"
                } else {
                    Write-Bad "Table audit_logs MANQUANTE"
                }
                $bddNeedsFix = (-not $bdd.login_attempts) -or (-not $bdd.audit_logs)
            }
        } catch {
            Write-Warn "Impossible de parser la sortie : $lastLine"
            $bddNeedsFix = $true
        }
    } else {
        Write-Warn "Pas de sortie JSON. Sortie brute :"
        Write-Info $output
        $bddNeedsFix = $true
    }
} catch {
    Write-Bad "Erreur execution verify : $_"
    $bddNeedsFix = $true
}
Pop-Location

# ============================================================================
# FIX migration BDD si necessaire
# ============================================================================

if ($bddNeedsFix) {
    Write-Step "6. FIX migration Prisma"

    Write-Info "Lance la migration manuellement :"
    Write-Host "  pnpm --filter api prisma:migrate" -ForegroundColor Yellow
    Write-Info ""
    Write-Info "Tape 'O' pour la lancer maintenant (le script va te demander un nom de migration) :"
    $answer = Read-Host

    if ($answer -eq 'O' -or $answer -eq 'o') {
        Push-Location $RepoRoot
        try {
            # Utilise le script pnpm defini dans api/package.json
            & pnpm --filter api prisma:migrate
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Migration executee"
            } else {
                Write-Bad "Migration echouee (code $LASTEXITCODE)"
            }
        } catch {
            Write-Bad "Exception : $_"
        }
        Pop-Location
    }
}

# ============================================================================
# Attente redemarrage API si modifs
# ============================================================================

if ($hx05NeedsFix -or $hx08NeedsFix) {
    Write-Step "7. Attente redemarrage tsx watch"
    Start-Sleep -Seconds 3
    if (-not (Wait-ApiReady -TimeoutSec 25)) {
        Write-Warn "L'API ne repond plus. Verifie le terminal pnpm dev."
        exit 1
    }
    Write-OK "API redemarree"
}

# ============================================================================
# RETEST H-05 timing
# ============================================================================

Write-Step "8. RETEST H-05 timing"

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

Write-Info "  User existant   : ~$([Math]::Round($avgExist)) ms (5 essais)"
Write-Info "  User inexistant : ~$([Math]::Round($avgNoExist)) ms (5 essais)"
Write-Info "  Difference      : $([Math]::Round($diff)) ms"

if ($diff -lt 50) {
    Write-Fixed "Anti-timing OK (ecart < 50ms)"
} elseif ($diff -lt 100) {
    Write-Warn "Ecart modere - peut suffire"
} else {
    Write-Bad "Ecart toujours trop grand"
    Write-Info "Le user inexistant retourne TROP vite -> hashToCheck pas appele"
}

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT FINAL"

Write-Host ""
$timingOk = $diff -lt 100
Write-Host ("  H-05 anti-timing  : " + $(if ($timingOk) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($timingOk) { 'Green' } else { 'Red' })
Write-Host ("  H-08 origin check : " + $(if ($appContent.Contains('originCheck')) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($appContent.Contains('originCheck')) { 'Green' } else { 'Red' })

# Re-check BDD
Push-Location $ApiDir
try {
    $verifyFile = Join-Path $env:TEMP "verify-bdd-$(Get-Random).cjs"
    Set-Content -Path $verifyFile -Value $verifyScript -Encoding UTF8
    $output = node $verifyFile 2>&1 | Out-String
    Remove-Item $verifyFile -Force -ErrorAction SilentlyContinue
    $lastLine = ($output -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1).Trim()
    if ($lastLine) {
        $bdd = $lastLine | ConvertFrom-Json
        Write-Host ("  H-06 login_attempts : " + $(if ($bdd.login_attempts) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bdd.login_attempts) { 'Green' } else { 'Red' })
        Write-Host ("  H-07 audit_logs     : " + $(if ($bdd.audit_logs) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($bdd.audit_logs) { 'Green' } else { 'Red' })
    }
} catch { }
Pop-Location
