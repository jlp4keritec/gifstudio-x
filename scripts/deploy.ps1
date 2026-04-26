#requires -Version 5.1
<#
.SYNOPSIS
    Deploiement / mise a jour de GifStudio-X sur le VPS.

.DESCRIPTION
    A executer apres chaque commit sur le repo. Le script :
    1. Pull les dernieres modifs depuis GitHub
    2. Build les images Docker (api + web)
    3. Lance/redemarre les conteneurs
    4. Verifie que tout repond

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -SkipBuild   # juste un docker compose up sans rebuild
    .\deploy.ps1 -Tail        # affiche les logs en continu apres deploy
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$Tail
)

$ErrorActionPreference = 'Stop'

$VpsHost      = '151.80.232.214'
$VpsUser      = 'ubuntu'
$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519_gifstudio_nopass"
$AppRoot      = '/var/www/gifstudio-x'
$Domain       = 'gifstudio.toolspdf.net'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Bad($msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Gray }

function Invoke-Ssh {
    param([Parameter(Mandatory)][string]$Command)
    if ($DryRun) {
        Write-Info "[DRY-RUN] ssh: $Command"
        return ""
    }
    $sshArgs = @(
        '-i', $IdentityFile,
        '-o', 'StrictHostKeyChecking=accept-new',
        "$VpsUser@$VpsHost",
        $Command
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
        Write-Bad "SSH echoue (exit $LASTEXITCODE) : $Command"
        Write-Info $output
        throw "SSH command failed"
    }
    return $output.Trim()
}

# ============================================================================
Write-Step "1. Pull derniers changements (fetch + reset --hard origin/main)"
$pullOut = Invoke-Ssh -Command "cd $AppRoot && git fetch origin main && git reset --hard origin/main"
Write-Info $pullOut
Write-OK "Code a jour"

# ============================================================================
Write-Step "2. Verification .env.production"
$envOk = Invoke-Ssh -Command "test -f $AppRoot/.env.production && echo YES || echo NO"
if ($envOk -ne 'YES') {
    Write-Bad ".env.production manquant !"
    Write-Info "Lance d'abord bootstrap-vps.ps1"
    exit 1
}
Write-OK ".env.production present"

# ============================================================================
if (-not $SkipBuild) {
    Write-Step "3. Build images Docker (api + web)"
    Write-Info "Cela peut prendre 5-10 minutes (FFmpeg + Playwright Chromium ~300 Mo)..."
    Invoke-Ssh -Command "cd $AppRoot && docker compose -f docker-compose.prod.yml --env-file .env.production build"
    Write-OK "Images buildees"
} else {
    Write-Step "3. Build SKIP (-SkipBuild)"
}

# ============================================================================
Write-Step "4. Demarrage conteneurs"
Invoke-Ssh -Command "cd $AppRoot && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --remove-orphans"
Write-OK "Conteneurs demarres"

# ============================================================================
Write-Step "5. Attente que l'API soit healthy"
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 3
    $status = Invoke-Ssh -Command "docker inspect --format '{{.State.Health.Status}}' gifstudio-x-api 2>/dev/null || echo none"
    if ($status -eq 'healthy') {
        $ready = $true
        break
    }
    Write-Info "  ... statut API : $status (essai $i/30)"
}
if ($ready) {
    Write-OK "API healthy"
} else {
    Write-Warn "API toujours pas healthy apres 90s"
    Write-Info "Logs API :"
    Invoke-Ssh -Command "docker logs --tail 50 gifstudio-x-api"
}

# ============================================================================
Write-Step "6. Test public"
try {
    $r = Invoke-WebRequest -Uri "https://$Domain/api/v1/health" `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
        Write-OK "https://$Domain/api/v1/health -> 200"
    } else {
        Write-Warn "https://$Domain/api/v1/health -> $($r.StatusCode)"
    }
} catch {
    Write-Warn "Health public KO : $($_.Exception.Message)"
    Write-Info "Verifie le DNS, le cert HTTPS, la conf Nginx"
}

# ============================================================================
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host "  Deploiement termine" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""
Write-Host "URL  : https://$Domain" -ForegroundColor Cyan
Write-Host ""

if ($Tail) {
    Write-Step "Logs en continu (Ctrl+C pour quitter)"
    Invoke-Ssh -Command "cd $AppRoot && docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=100"
}
