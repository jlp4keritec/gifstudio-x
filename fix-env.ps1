#requires -Version 5.1
<#
.SYNOPSIS
    Genere un JWT_SECRET et un ADMIN_PASSWORD propres et les injecte dans les
    .env du repo gifstudio-x (racine + apps/api/).

.DESCRIPTION
    1. Backup des 2 .env (avec timestamp)
    2. Generation de valeurs aleatoires fortes
    3. Affichage avant ecriture (l'utilisateur voit ce qui va etre fait)
    4. Demande confirmation
    5. Ecriture (en preservant tout le reste du fichier)
    6. Affichage des valeurs pour que l'user les note

.EXAMPLE
    .\fix-env.ps1
    .\fix-env.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)   { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Warn($msg)  { Write-Host "  [!]  $msg" -ForegroundColor Yellow }

function New-Banner($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

# ============================================================================
# Helpers de generation
# ============================================================================

function New-StrongJwtSecret {
    # 48 caracteres ASCII printable (sans espaces ni guillemets pour eviter
    # les soucis dans les .env). Pool : alphanumerique + symboles surs.
    $pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_+=*~^@%&'
    -join ((1..48) | ForEach-Object {
        $pool[(Get-Random -Min 0 -Max $pool.Length)]
    })
}

function New-StrongPassword {
    # 16 chars : 4 minuscules + 4 majuscules + 4 chiffres + 4 symboles
    # melanges. Garantit la conformite avec H-04 (maj + chiffre + special).
    $lowers = 'abcdefghijkmnopqrstuvwxyz'  # sans l (confusion avec 1)
    $uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ'   # sans I, O (confusion 1, 0)
    $digits = '23456789'                    # sans 0, 1
    $symbols = '!@#$%^&*-_+='

    $chars = @()
    1..4 | ForEach-Object { $chars += $lowers[(Get-Random -Min 0 -Max $lowers.Length)] }
    1..4 | ForEach-Object { $chars += $uppers[(Get-Random -Min 0 -Max $uppers.Length)] }
    1..4 | ForEach-Object { $chars += $digits[(Get-Random -Min 0 -Max $digits.Length)] }
    1..4 | ForEach-Object { $chars += $symbols[(Get-Random -Min 0 -Max $symbols.Length)] }

    # Shuffle
    $shuffled = $chars | Sort-Object { Get-Random }
    return -join $shuffled
}

# ============================================================================
# Helpers .env
# ============================================================================

function Update-EnvFile {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Replacements
    )

    if (-not (Test-Path $Path)) {
        Write-Bad "Fichier introuvable : $Path"
        return $false
    }

    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    $modified = $false

    foreach ($key in $Replacements.Keys) {
        $newValue = $Replacements[$key]
        # Pattern : KEY=anything (jusqu'a fin de ligne)
        # Note : on ne touche pas aux commentaires (lignes commencant par #)
        $pattern = "(?m)^${key}=.*`$"

        if ($content -match $pattern) {
            $content = [regex]::Replace($content, $pattern, "${key}=$newValue")
            $modified = $true
            Write-Info "  $Path : $key mis a jour"
        } else {
            Write-Warn "  $Path : ligne $key= introuvable - pas de modification"
        }
    }

    if ($modified -and -not $DryRun) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
    }
    return $modified
}

function Backup-File {
    param([string]$Path)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$Path.backup-$stamp"
    Copy-Item -Path $Path -Destination $backup -Force
    return $backup
}

# ============================================================================
# 0. PRE-VOLS
# ============================================================================

New-Banner "Generation et injection JWT_SECRET / ADMIN_PASSWORD"

Write-Step "0. Verifications"

$EnvRoot = Join-Path $RepoRoot '.env'
$EnvApi = Join-Path $RepoRoot 'apps\api\.env'

$missing = @()
if (-not (Test-Path $EnvRoot)) { $missing += $EnvRoot }
if (-not (Test-Path $EnvApi))  { $missing += $EnvApi }

if ($missing.Count -gt 0) {
    Write-Bad "Fichier(s) manquant(s) :"
    $missing | ForEach-Object { Write-Info "  - $_" }
    exit 1
}
Write-OK ".env (racine) et apps/api/.env trouves"

# ============================================================================
# 1. Generation des valeurs
# ============================================================================

Write-Step "1. Generation des nouvelles valeurs"

$newJwtSecret = New-StrongJwtSecret
$newAdminPassword = New-StrongPassword

Write-Info "JWT_SECRET genere :"
Write-Host "  $newJwtSecret" -ForegroundColor Yellow
Write-Info "  ($($newJwtSecret.Length) caracteres)"

Write-Info ""
Write-Info "ADMIN_PASSWORD genere :"
Write-Host "  $newAdminPassword" -ForegroundColor Yellow
Write-Info "  ($($newAdminPassword.Length) caracteres avec maj+chiffre+symbole)"

# ============================================================================
# 2. Affichage des valeurs actuelles (sans afficher les secrets en clair)
# ============================================================================

Write-Step "2. Valeurs actuelles dans tes .env"

function Show-CurrentValue {
    param([string]$Path, [string]$Key)
    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    $match = [regex]::Match($content, "(?m)^${Key}=(.*)`$")
    if ($match.Success) {
        $val = $match.Groups[1].Value
        if ($val.Length -gt 8) {
            $masked = $val.Substring(0, 4) + ('*' * ($val.Length - 8)) + $val.Substring($val.Length - 4)
        } else {
            $masked = '*' * $val.Length
        }
        Write-Info "  $Path"
        Write-Info "    $Key = $masked  (${val.Length} chars)" -ErrorAction SilentlyContinue
        Write-Info ("    ${Key} = ${masked}  (" + $val.Length + " chars)")
    } else {
        Write-Warn "  $Path : ligne $Key= introuvable"
    }
}

Show-CurrentValue -Path $EnvRoot -Key 'JWT_SECRET'
Show-CurrentValue -Path $EnvRoot -Key 'ADMIN_PASSWORD'
Show-CurrentValue -Path $EnvApi -Key 'JWT_SECRET'
Show-CurrentValue -Path $EnvApi -Key 'ADMIN_PASSWORD'

# ============================================================================
# 3. Confirmation
# ============================================================================

Write-Step "3. Confirmation avant modification"

if ($DryRun) {
    Write-Warn "DRY-RUN : aucune modification ne sera ecrite"
    Write-Info "Voici ce qui serait fait :"
    Write-Info "  - Backup de $EnvRoot vers $EnvRoot.backup-XXXXX"
    Write-Info "  - Backup de $EnvApi vers $EnvApi.backup-XXXXX"
    Write-Info "  - Remplacement de JWT_SECRET et ADMIN_PASSWORD par les nouvelles valeurs ci-dessus"
    Write-Info ""
    Write-Info "Pour appliquer reellement : .\fix-env.ps1"
    exit 0
}

Write-Info ""
Write-Info "Le script va :"
Write-Info "  - Sauvegarder tes 2 .env (avec timestamp .backup-YYYYMMDD-HHMMSS)"
Write-Info "  - Remplacer JWT_SECRET et ADMIN_PASSWORD par les nouvelles valeurs"
Write-Info "  - Tout le reste du fichier reste intact (autres variables, commentaires)"
Write-Info ""
Write-Host "Continuer ? (O/N) " -ForegroundColor Yellow -NoNewline
$answer = Read-Host

if ($answer -ne 'O' -and $answer -ne 'o') {
    Write-Info "Annule. Aucune modification."
    exit 0
}

# ============================================================================
# 4. Backup + ecriture
# ============================================================================

Write-Step "4. Backup et modification"

$backupRoot = Backup-File -Path $EnvRoot
Write-OK "Backup : $backupRoot"
$backupApi = Backup-File -Path $EnvApi
Write-OK "Backup : $backupApi"

$replacements = @{
    'JWT_SECRET'     = $newJwtSecret
    'ADMIN_PASSWORD' = $newAdminPassword
}

Write-Info ""
$rootOk = Update-EnvFile -Path $EnvRoot -Replacements $replacements
$apiOk  = Update-EnvFile -Path $EnvApi  -Replacements $replacements

if ($rootOk -and $apiOk) {
    Write-OK "Les 2 .env mis a jour"
} else {
    Write-Warn "Au moins un fichier n'a pas ete mis a jour"
}

# ============================================================================
# 5. Recap final + sauvegarde des valeurs
# ============================================================================

New-Banner "TES NOUVELLES VALEURS - NOTE-LES MAINTENANT"

Write-Host ""
Write-Host "  JWT_SECRET     = " -NoNewline -ForegroundColor Cyan
Write-Host $newJwtSecret -ForegroundColor Yellow
Write-Host ""
Write-Host "  ADMIN_PASSWORD = " -NoNewline -ForegroundColor Cyan
Write-Host $newAdminPassword -ForegroundColor Yellow
Write-Host ""

# Optionnel : ecrire dans un fichier hors du repo (pour que l'utilisateur le retrouve)
$rememberFile = Join-Path $env:USERPROFILE 'gifstudio-x-credentials.txt'
$rememberContent = @"
GifStudio-X - credentials generes le $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

JWT_SECRET     = $newJwtSecret
ADMIN_PASSWORD = $newAdminPassword

Note : les hashs des users existants restent valides apres ce changement.
Ton ancien mot de passe admin (AdminX123) fonctionne toujours pour te connecter.
La nouvelle valeur ADMIN_PASSWORD ne s'applique qu'au prochain seed (db:reset).

Backups :
  $backupRoot
  $backupApi
"@

try {
    Set-Content -Path $rememberFile -Value $rememberContent -Encoding UTF8
    Write-Info "Sauvegarde aussi dans : $rememberFile"
} catch {
    Write-Warn "Impossible d'ecrire $rememberFile - note les valeurs ci-dessus"
}

Write-Host ""
Write-Warn "IMPORTANT :"
Write-Info "  - Pour te connecter : utilise toujours AdminX123 (le user existant n'a pas change)"
Write-Info "  - Le NEW ADMIN_PASSWORD ne s'appliquera qu'apres pnpm db:reset (prochain seed)"
Write-Info "  - Le NEW JWT_SECRET sera utilise au prochain redemarrage de l'API"
Write-Info "  - Tous les JWT existants (cookies de session) seront invalides -> tu devras te reconnecter"

Write-Host ""
Write-Host "Prochaine etape : .\finish-lot-E.ps1" -ForegroundColor Cyan
