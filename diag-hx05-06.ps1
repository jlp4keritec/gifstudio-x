#requires -Version 5.1
<#
.SYNOPSIS
    Diagnostic apres patch HX-05/06/07 partiellement applique.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Bloc($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

$BrowserAdapterFile = Join-Path $RepoRoot 'apps\api\src\services\crawler\adapters\generic-browser-adapter.ts'
$CrawlerRouteFile = Join-Path $RepoRoot 'apps\api\src\routes\crawler.ts'
$RateLimitFile = Join-Path $RepoRoot 'apps\api\src\middlewares\rate-limit.ts'

# ============================================================================
# Diag HX-05
# ============================================================================
Write-Step "DIAG HX-05 - contenu actuel du bloc args Playwright"

$content = Get-Content -Path $BrowserAdapterFile -Raw -Encoding UTF8

# On extrait le bloc qui commence par "args:" et finit par la 1re "],"
$match = [regex]::Match($content, "(?s)args:\s*\[(.*?)\],")
if ($match.Success) {
    Write-Info "Bloc args trouve dans le fichier :"
    Write-Bloc "args: ["
    $match.Groups[1].Value -split "`n" | ForEach-Object { 
        $line = $_.TrimEnd("`r")
        if ($line.Trim()) { Write-Bloc $line } 
    }
    Write-Bloc "],"
    
    if ($match.Groups[1].Value -match "'--no-sandbox'") {
        Write-Bad "--no-sandbox encore present"
        Write-Info "Probable cause : la liste a un format different de celui attendu par le script"
        Write-Info "(virgules, espaces, ordre des args, etc.)"
    }
} else {
    Write-Bad "Aucun bloc args: [...] trouve dans le fichier"
}

# ============================================================================
# Diag HX-06
# ============================================================================
Write-Step "DIAG HX-06 - contenu actuel de routes/crawler.ts"

$crawlerContent = Get-Content -Path $CrawlerRouteFile -Raw -Encoding UTF8

# Verifier l'import
if ($crawlerContent -match "import \{ strictRateLimiter \} from '../middlewares/rate-limit'") {
    Write-OK "Import strictRateLimiter present"
} else {
    Write-Bad "Import strictRateLimiter MANQUANT"
}

# Verifier les routes
$routes = @('test-generic-html', 'test-generic-browser', 'sources/:id/run')
foreach ($r in $routes) {
    $escaped = [regex]::Escape($r)
    if ($crawlerContent -match "'/$escaped'.*strictRateLimiter") {
        Write-OK "Route $r : strictRateLimiter applique"
    } elseif ($crawlerContent -match "'/$escaped'") {
        Write-Bad "Route $r existe mais SANS strictRateLimiter"
    } else {
        Write-Bad "Route $r INTROUVABLE dans le fichier"
    }
}

# Verifier rate-limit.ts
Write-Step "DIAG HX-06 - contenu rate-limit.ts"
$rlContent = Get-Content -Path $RateLimitFile -Raw -Encoding UTF8
if ($rlContent -match "function strictRateLimiter") {
    Write-OK "strictRateLimiter defini dans rate-limit.ts"
    if ($rlContent -match "STRICT_MAX = (\d+)") {
        Write-Info "Limite : $($matches[1]) requetes / 5 min"
    }
} else {
    Write-Bad "strictRateLimiter MANQUANT dans rate-limit.ts"
}

# ============================================================================
# Test reel HX-06 avec affichage detaille
# ============================================================================
Write-Step "TEST HX-06 - 3 appels avec affichage detaille du body"

$loginBody = @{ identifier = $AdminEmail; password = $AdminPassword } | ConvertTo-Json -Compress
$session = $null
try {
    Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' -Body $loginBody `
        -SessionVariable session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    Write-OK "Login OK"
} catch {
    Write-Bad "Login KO : $_"
    exit 1
}

for ($i = 1; $i -le 3; $i++) {
    Write-Info ""
    Write-Info "Appel #${i} sur /crawler/test-generic-html :"
    $body = '{"config":{"url":"https://example.com","videoSelectors":["video"]}}'
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/crawler/test-generic-html" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Info "  Status : $($r.StatusCode)"
        Write-Info "  Body   : $($r.Content)"
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode.value__
            Write-Info "  Status : $code"
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                Write-Info "  Body   : $body"
            } catch { }
        } else {
            Write-Info "  Erreur : $($_.Exception.Message)"
        }
    }
}
