#requires -Version 5.1
<#
.SYNOPSIS
    Bootstrap VPS pour GifStudio-X (mode prive avec Basic Auth Nginx).

.DESCRIPTION
    A executer UNE FOIS pour preparer le VPS :
    1. Decommissionne l'ancienne stack gifstudio (publique) avec son volume Postgres
    2. Verifie les prerequis (Docker, Nginx, Certbot)
    3. Cree /var/www/gifstudio-x + storage
    4. Init le repo gifstudio-x (git init + fetch + reset, compatible dossier non vide)
    5. Genere .env.production avec secrets aleatoires
    6. Cree .htpasswd Nginx pour Basic Auth (admin@gifstudio-x.local)
    7. Configure Nginx (reverse proxy + Basic Auth)
    8. Reutilise le cert Let's Encrypt existant pour gifstudio.toolspdf.net

.EXAMPLE
    .\bootstrap-vps.ps1

.EXAMPLE
    .\bootstrap-vps.ps1 -DryRun       # simule sans rien faire
    .\bootstrap-vps.ps1 -Force        # regenere .env (perte des credentials admin)
    .\bootstrap-vps.ps1 -SkipDecomm   # skip le decommissionnement (deja fait)
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Force,
    [switch]$SkipDecomm
)

$ErrorActionPreference = 'Stop'

# ============================================================================
# CONFIGURATION
# ============================================================================

$VpsHost          = '151.80.232.214'
$VpsUser          = 'ubuntu'
$IdentityFile     = "$env:USERPROFILE\.ssh\id_ed25519_gifstudio_nopass"

$Domain           = 'gifstudio.toolspdf.net'
$RepoUrl          = 'https://github.com/jlp4keritec/gifstudio-x.git'
$AppRoot          = '/var/www/gifstudio-x'
$StorageRoot      = "$AppRoot/storage"
$AdminEmail       = 'admin@gifstudio.toolspdf.net'

# Basic Auth Nginx (mode prive C)
$BasicAuthUser    = 'admin@gifstudio-x.local'
$BasicAuthPass    = 'H6BqhGv8=Xf&&*42'   # correspond au mdp local choisi

# Ancienne stack a decommissionner
$OldAppRoot       = '/var/www/gifstudio'

# ============================================================================
# HELPERS
# ============================================================================

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Bad($msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Gray }

function Invoke-Ssh {
    param(
        [Parameter(Mandatory)][string]$Command,
        [switch]$Sudo,
        [string]$DryRunReturn = "OK_DRYRUN"
    )

    if ($Sudo) {
        $escaped = $Command -replace "'", "'\''"
        $finalCmd = "sudo sh -c '$escaped'"
    } else {
        $finalCmd = $Command
    }

    if ($DryRun) {
        Write-Info "[DRY-RUN] ssh: $finalCmd"
        return $DryRunReturn
    }

    $sshArgs = @(
        '-i', $IdentityFile,
        '-o', 'StrictHostKeyChecking=accept-new',
        "$VpsUser@$VpsHost",
        $finalCmd
    )

    $savedPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = ""
    try {
        $output = & ssh @sshArgs 2>&1 | Out-String
    } finally {
        $ErrorActionPreference = $savedPref
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Bad "Commande SSH echouee (exit $LASTEXITCODE) : $Command"
        Write-Info $output
        throw "SSH command failed (exit $LASTEXITCODE)"
    }
    return $output.Trim()
}

function New-RandomString {
    param([int]$Length = 32)
    $pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    -join ((1..$Length) | ForEach-Object { $pool[(Get-Random -Min 0 -Max $pool.Length)] })
}

# ============================================================================
# Banner
# ============================================================================

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Bootstrap VPS pour GifStudio-X (mode prive)" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Info "VPS    : $VpsUser@$VpsHost"
Write-Info "Domaine: $Domain"
Write-Info "App    : $AppRoot"
Write-Info "Repo   : $RepoUrl"
if ($DryRun) { Write-Warn "MODE DRY-RUN : aucune modification ne sera appliquee" }

# ============================================================================
# 0. Verification SSH + prerequis
# ============================================================================

Write-Step "0. Verification connexion SSH"
$whoami = Invoke-Ssh -Command "whoami"
Write-OK "Connexion etablie ($whoami)"

Write-Step "0bis. Verification prerequis"
foreach ($tool in @('docker', 'nginx', 'certbot', 'git', 'htpasswd')) {
    try {
        $out = Invoke-Ssh -Command "which $tool"
        if ($out) {
            Write-OK "$tool trouve : $out"
        } else {
            Write-Warn "$tool absent"
            if ($tool -eq 'htpasswd') {
                Write-Info "Installation : sudo apt install -y apache2-utils"
                Invoke-Ssh -Sudo -Command "apt-get install -y apache2-utils" | Out-Null
                Write-OK "apache2-utils installe"
            }
        }
    } catch {
        Write-Bad "$tool : erreur"
    }
}

# ============================================================================
# 1. Decommissionnement ancienne stack
# ============================================================================

if ($SkipDecomm) {
    Write-Step "1. Decommissionnement SKIP (-SkipDecomm)"
} else {
    Write-Step "1. Decommissionnement de l'ancienne stack gifstudio (publique)"

    $hasOld = Invoke-Ssh -Command "test -d $OldAppRoot && echo YES || echo NO"
    if ($hasOld -eq 'YES') {
        Write-Info "Ancienne stack detectee dans $OldAppRoot"

        # Stop + supprime les conteneurs + le volume Postgres
        Invoke-Ssh -Sudo -Command "cd $OldAppRoot && docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true"
        Write-OK "Conteneurs arretes et volume supprime"

        # Suppression du dossier
        Invoke-Ssh -Sudo -Command "rm -rf $OldAppRoot"
        Write-OK "Dossier $OldAppRoot supprime"

        # Suppression de la conf Nginx
        Invoke-Ssh -Sudo -Command "rm -f /etc/nginx/sites-enabled/gifstudio /etc/nginx/sites-available/gifstudio"
        Write-OK "Conf Nginx ancienne supprimee"

        # Verifier qu'il ne reste pas de container orphelin
        $orphans = Invoke-Ssh -Command "docker ps -a --filter 'name=^gifstudio-' --format '{{.Names}}' | grep -v '^gifstudio-x' || true"
        if ($orphans) {
            Write-Warn "Conteneurs orphelins detectes : $orphans"
            Invoke-Ssh -Command "docker rm -f $orphans 2>/dev/null || true"
            Write-OK "Conteneurs orphelins supprimes"
        }
    } else {
        Write-Info "Aucune ancienne stack detectee dans $OldAppRoot"
    }
}

# ============================================================================
# 2. Verification DNS + cert HTTPS
# ============================================================================

Write-Step "2. Verification DNS"
$resolved = Invoke-Ssh -Command "host $Domain 2>&1 | grep -oP '(\d+\.){3}\d+' | head -1"
if ($resolved -eq $VpsHost) {
    Write-OK "DNS $Domain -> $resolved"
} else {
    Write-Warn "DNS $Domain -> $resolved (attendu : $VpsHost)"
    Write-Info "Si le DNS n'est pas encore propage, le cert HTTPS pourrait ne pas se renouveler."
}

Write-Step "2bis. Verification cert Let's Encrypt"
$certExists = Invoke-Ssh -Sudo -Command "test -f /etc/letsencrypt/live/$Domain/fullchain.pem && echo YES || echo NO"
if ($certExists -eq 'YES') {
    Write-OK "Cert deja present pour $Domain (reutilise)"
} else {
    Write-Warn "Cert manquant pour $Domain"
    Write-Info "Faudra le creer manuellement : sudo certbot --nginx -d $Domain"
}

# ============================================================================
# 3. Creation du dossier app + storage
# ============================================================================

Write-Step "3. Creation $AppRoot + storage"

Invoke-Ssh -Sudo -Command "mkdir -p $AppRoot $StorageRoot/videos $StorageRoot/gifs $StorageRoot/thumbnails $StorageRoot/trash"
Invoke-Ssh -Sudo -Command "chown -R $VpsUser`:$VpsUser $AppRoot"
Write-OK "Dossiers crees"

# ============================================================================
# 4. Init du repo (compatible dossier non vide a cause du storage cree etape 3)
# ============================================================================

Write-Step "4. Init du repo gifstudio-x"

$repoExists = Invoke-Ssh -Command "test -d $AppRoot/.git && echo YES || echo NO"
if ($repoExists -eq 'YES') {
    if ($Force) {
        Write-Warn "-Force : reset hard sur origin/main (preserve storage/ et .env.production)"
        Invoke-Ssh -Command "cd $AppRoot && git fetch origin main && git reset --hard origin/main && git clean -fdx -e storage -e .env.production"
        Write-OK "Repo reinitialise"
    } else {
        Write-Info "Repo deja initialise, fetch + reset"
        Invoke-Ssh -Command "cd $AppRoot && git fetch origin main && git reset --hard origin/main"
        Write-OK "Repo a jour"
    }
} else {
    # Le dossier existe deja (cree etape 3 avec storage/) donc 'git clone .' refuserait.
    # On passe par git init + remote + fetch + reset --hard qui acceptent un dossier non vide.
    Invoke-Ssh -Command "cd $AppRoot && git init -b main && git remote add origin $RepoUrl && git fetch origin main && git reset --hard origin/main"
    Write-OK "Repo initialise : $RepoUrl"
}

# ============================================================================
# 5. Generation .env.production
# ============================================================================

Write-Step "5. Generation .env.production"

$envExists = Invoke-Ssh -Command "test -f $AppRoot/.env.production && echo YES || echo NO"
if ($envExists -eq 'YES' -and -not $Force) {
    Write-Info ".env.production existe deja - garde tel quel (utilise -Force pour regenerer)"
} else {
    if ($DryRun) {
        Write-Info "[DRY-RUN] Generation .env.production"
    } else {
        $postgresPassword = New-RandomString -Length 32
        $jwtSecret        = New-RandomString -Length 48
        $adminPasswordTmp = New-RandomString -Length 16

        $envContent = @"
PUBLIC_URL=https://$Domain

POSTGRES_USER=gifstudio_x
POSTGRES_PASSWORD=$postgresPassword
POSTGRES_DB=gifstudio_x

JWT_SECRET=$jwtSecret

ADMIN_EMAIL=$AdminEmail
ADMIN_PASSWORD=$adminPasswordTmp
FORCE_PASSWORD_CHANGE=true

STORAGE_PATH=$StorageRoot

MAX_UPLOAD_SIZE_MB=500
MAX_VIDEO_DURATION_SECONDS=600

RULE34_API_KEY=
RULE34_USER_ID=
"@

        # Ecriture sur le VPS
        $envBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
        Invoke-Ssh -Command "echo '$envBase64' | base64 -d > $AppRoot/.env.production"
        Invoke-Ssh -Command "chmod 600 $AppRoot/.env.production"

        Write-OK ".env.production genere"

        Write-Host ""
        Write-Host "  CREDENTIALS ADMIN INITIAL (NOTE-LES MAINTENANT !)" -ForegroundColor Yellow -BackgroundColor DarkRed
        Write-Host "  =====================================" -ForegroundColor Yellow
        Write-Host "  Email    : $AdminEmail" -ForegroundColor Yellow
        Write-Host "  Password : $adminPasswordTmp" -ForegroundColor Yellow
        Write-Host "  =====================================" -ForegroundColor Yellow
        Write-Host ""

        # Sauvegarde en local pour ne pas perdre
        $rememberFile = Join-Path $env:USERPROFILE 'gifstudio-x-vps-credentials.txt'
        @"
GifStudio-X VPS - credentials initiaux generes le $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

URL : https://$Domain

Basic Auth Nginx (popup navigateur):
  Login    : $BasicAuthUser
  Password : $BasicAuthPass

Login App (apres Basic Auth):
  Email    : $AdminEmail
  Password : $adminPasswordTmp
  (Forced password change at first login)

Postgres : $postgresPassword
JWT      : $jwtSecret
"@ | Set-Content -Path $rememberFile -Encoding UTF8
        Write-Info "Sauvegarde dans : $rememberFile"
    }
}

# ============================================================================
# 6. Creation .htpasswd Nginx (Basic Auth)
# ============================================================================

Write-Step "6. Creation .htpasswd pour Basic Auth Nginx"

$htpasswdPath = "/etc/nginx/.htpasswd-gifstudio-x"
$htpasswdExists = Invoke-Ssh -Sudo -Command "test -f $htpasswdPath && echo YES || echo NO"
if ($htpasswdExists -eq 'YES' -and -not $Force) {
    Write-Info ".htpasswd existe deja"
} else {
    # Generer le hash via htpasswd sur le VPS
    $escapedPass = $BasicAuthPass -replace "'", "'\''"
    Invoke-Ssh -Sudo -Command "htpasswd -bcB $htpasswdPath '$BasicAuthUser' '$escapedPass'"
    Invoke-Ssh -Sudo -Command "chmod 644 $htpasswdPath"
    Write-OK ".htpasswd cree"
    Write-Host ""
    Write-Host "  BASIC AUTH NGINX (popup navigateur) :" -ForegroundColor Yellow
    Write-Host "  Login    : $BasicAuthUser" -ForegroundColor Yellow
    Write-Host "  Password : $BasicAuthPass" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================================================
# 7. Installation conf Nginx
# ============================================================================

Write-Step "7. Installation conf Nginx"

# Le fichier nginx/gifstudio-x.conf est dans le repo clone
Invoke-Ssh -Sudo -Command "cp $AppRoot/nginx/gifstudio-x.conf /etc/nginx/sites-available/gifstudio-x"
Invoke-Ssh -Sudo -Command "ln -sf /etc/nginx/sites-available/gifstudio-x /etc/nginx/sites-enabled/gifstudio-x"

# Test conf
$nginxTest = Invoke-Ssh -Sudo -Command "nginx -t 2>&1"
if ($nginxTest -match 'syntax is ok' -and $nginxTest -match 'test is successful') {
    Write-OK "Conf Nginx valide"
    Invoke-Ssh -Sudo -Command "systemctl reload nginx"
    Write-OK "Nginx recharge"
} else {
    Write-Bad "Conf Nginx invalide :"
    Write-Info $nginxTest
    throw "Nginx config error"
}

# ============================================================================
# Final
# ============================================================================

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host "  Bootstrap termine" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""
Write-Host "Prochaine etape :" -ForegroundColor Cyan
Write-Host "  .\deploy.ps1     # build et lance les conteneurs Docker" -ForegroundColor Gray
Write-Host ""
Write-Host "Une fois deployee, l'app sera accessible sur :" -ForegroundColor Cyan
Write-Host "  https://$Domain" -ForegroundColor Yellow
Write-Host ""
Write-Host "Tu devras te connecter 2 fois :" -ForegroundColor Cyan
Write-Host "  1. Popup Basic Auth navigateur : $BasicAuthUser / $BasicAuthPass" -ForegroundColor Gray
Write-Host "  2. Login app (admin)            : $AdminEmail / [voir .txt sauvegarde]" -ForegroundColor Gray
