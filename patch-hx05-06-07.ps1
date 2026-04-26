#requires -Version 5.1
<#
.SYNOPSIS
    Patch HX-05 + HX-06 + HX-07 — Playwright hardening, rate-limit tests crawler,
    rate-limit endpoint public file.

.DESCRIPTION
    Applique 3 patches petits et peu risques :

    HX-05 : retire --no-sandbox de Playwright (et durcit les args Chromium)
    HX-06 : ajoute strictRateLimiter aux endpoints /api/v1/crawler/test-generic-*
            et /api/v1/crawler/sources/:id/run
    HX-07 : ajoute streamingRateLimiter a /api/v1/videos/file/:slug

    Les 3 patches sont independants. Le script est idempotent.

.EXAMPLE
    cd C:\gifstudio-x
    .\patch-hx05-06-07.ps1
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123',
    [switch]$DryRun,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

# ============================================================================
# HELPERS
# ============================================================================

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)   { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Warn($msg)  { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Skip($msg)  { Write-Host "  [SKIP] $msg" -ForegroundColor DarkGray }
function Write-Fixed($msg) { Write-Host "  >>> FIX VERIFIE : $msg" -ForegroundColor Green -BackgroundColor DarkGreen }

function New-Banner($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Save-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    if ($DryRun) { return }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Wait-ApiReady {
    param([int]$TimeoutSec = 15)
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

function Connect-Admin {
    $loginBody = @{ identifier = $AdminEmail; password = $AdminPassword } | ConvertTo-Json -Compress
    $session = $null
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
            -Method POST -ContentType 'application/json' -Body $loginBody `
            -SessionVariable session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { return $session }
    } catch {
        Write-Bad "Login echoue : $($_.Exception.Message)"
    }
    return $null
}

# ============================================================================
# CHEMINS
# ============================================================================

$ApiDir = Join-Path $RepoRoot 'apps\api'
$BrowserAdapterFile = Join-Path $ApiDir 'src\services\crawler\adapters\generic-browser-adapter.ts'
$RateLimitFile = Join-Path $ApiDir 'src\middlewares\rate-limit.ts'
$CrawlerRouteFile = Join-Path $ApiDir 'src\routes\crawler.ts'
$VideosRouteFile = Join-Path $ApiDir 'src\routes\videos.ts'

# ============================================================================
# 0. PRE-VOLS
# ============================================================================

New-Banner "Patches HX-05 + HX-06 + HX-07"

Write-Step "0. Verifications prealables"

if (-not (Test-Path $ApiDir)) {
    Write-Bad "Dossier introuvable : $ApiDir"
    Write-Info "Lance le script depuis la racine du repo gifstudio-x"
    exit 1
}
Write-OK "Repo trouve : $RepoRoot"

$missing = @()
foreach ($f in @($BrowserAdapterFile, $RateLimitFile, $CrawlerRouteFile, $VideosRouteFile)) {
    if (-not (Test-Path $f)) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Write-Bad "Fichiers manquants :"
    $missing | ForEach-Object { Write-Info "  - $_" }
    exit 1
}
Write-OK "4 fichiers cibles trouves"

if (-not (Wait-ApiReady -TimeoutSec 3)) {
    Write-Warn "L'API ne repond pas encore. Demarre 'pnpm dev' dans un autre terminal."
    Write-Info "Le script va attendre 15s..."
    if (-not (Wait-ApiReady -TimeoutSec 15)) {
        Write-Bad "API toujours absente. Demarre pnpm dev puis relance ce script."
        exit 1
    }
}
Write-OK "API repond sur $ApiUrl"

# ============================================================================
# HX-05 : Playwright hardening
# ============================================================================

Write-Step "1. HX-05 - Retrait de --no-sandbox + durcissement Chromium"

$browserContent = Get-Content -Path $BrowserAdapterFile -Raw -Encoding UTF8

if ($browserContent -notmatch "'--no-sandbox'") {
    Write-Skip "HX-05 deja applique (pas de --no-sandbox detecte)"
    $hx05Applied = $false
} else {
    $oldArgs = @"
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
"@

    $newArgs = @"
    // [Patch HX-05] --no-sandbox retire ; sandbox utilisateur active
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-software-rasterizer',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=IsolateOrigins,site-per-process,TranslateUI',
      '--disable-background-networking',
    ],
"@

    # Normaliser les fins de ligne
    $needle = $oldArgs -replace "`r`n", "`n"
    $haystack = $browserContent -replace "`r`n", "`n"

    if ($haystack -notmatch [regex]::Escape($needle)) {
        Write-Bad "Bloc args Playwright introuvable - le fichier a evolue"
        Write-Info "Patch manuel necessaire sur generic-browser-adapter.ts"
        $hx05Applied = $false
    } else {
        $haystack = $haystack -replace [regex]::Escape($needle), $newArgs
        $browserContent = $haystack -replace "`n", "`r`n"
        Save-FileUtf8NoBom -Path $BrowserAdapterFile -Content $browserContent
        Write-OK "HX-05 applique : --no-sandbox retire, args Chromium durcis"
        $hx05Applied = $true
    }
}

# ============================================================================
# HX-06 + HX-07 : Ajout des rate-limiters
# ============================================================================

Write-Step "2. HX-06 + HX-07 - Ajout strictRateLimiter et streamingRateLimiter"

$rateLimitContent = Get-Content -Path $RateLimitFile -Raw -Encoding UTF8

if ($rateLimitContent -match "function strictRateLimiter") {
    Write-Skip "Rate-limiters supplementaires deja presents"
    $rateLimiterAdded = $false
} else {
    # Ajout en fin de fichier
    $newRateLimiters = @"


// ============================================================================
// [Patch HX-06] strictRateLimiter
// 10 req / 5 min par IP. Pour endpoints sensibles : test crawler, source run.
// ============================================================================
const STRICT_WINDOW_MS = 5 * 60 * 1000;
const STRICT_MAX = 10;
const strictAttempts = new Map<string, { count: number; firstAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, a] of strictAttempts.entries()) {
    if (a.firstAt + STRICT_WINDOW_MS < now) strictAttempts.delete(key);
  }
}, 60_000).unref();

export function strictRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const a = strictAttempts.get(key);
  if (!a || a.firstAt + STRICT_WINDOW_MS < now) {
    strictAttempts.set(key, { count: 1, firstAt: now });
    return next();
  }
  a.count += 1;
  if (a.count > STRICT_MAX) {
    return next(new AppError(429, 'Trop de requetes. Reessayez dans quelques minutes.', 'RATE_LIMITED_STRICT'));
  }
  next();
}

// ============================================================================
// [Patch HX-07] streamingRateLimiter
// 60 req / 1 min par IP. Pour endpoint public de streaming video (Range
// requests = plusieurs req par lecture).
// ============================================================================
const STREAM_WINDOW_MS = 60 * 1000;
const STREAM_MAX = 60;
const streamAttempts = new Map<string, { count: number; firstAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, a] of streamAttempts.entries()) {
    if (a.firstAt + STREAM_WINDOW_MS < now) streamAttempts.delete(key);
  }
}, 30_000).unref();

export function streamingRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const a = streamAttempts.get(key);
  if (!a || a.firstAt + STREAM_WINDOW_MS < now) {
    streamAttempts.set(key, { count: 1, firstAt: now });
    return next();
  }
  a.count += 1;
  if (a.count > STREAM_MAX) {
    return next(new AppError(429, 'Trop de requetes sur ce fichier. Patientez.', 'RATE_LIMITED_STREAM'));
  }
  next();
}
"@

    $rateLimitContent = $rateLimitContent.TrimEnd() + $newRateLimiters + "`r`n"
    Save-FileUtf8NoBom -Path $RateLimitFile -Content $rateLimitContent
    Write-OK "Ajoute : strictRateLimiter + streamingRateLimiter"
    $rateLimiterAdded = $true
}

# ============================================================================
# HX-06 : Application sur routes/crawler.ts
# ============================================================================

Write-Step "3. HX-06 - Application strictRateLimiter sur routes crawler"

$crawlerRouteContent = Get-Content -Path $CrawlerRouteFile -Raw -Encoding UTF8

if ($crawlerRouteContent -match "strictRateLimiter") {
    Write-Skip "HX-06 deja applique sur routes/crawler.ts"
    $hx06Applied = $false
} else {
    # Ajout import du rate-limiter
    $oldImport = "import { requireAuth, requireRole } from '../middlewares/auth';"
    $newImport = $oldImport + "`r`nimport { strictRateLimiter } from '../middlewares/rate-limit';"

    if ($crawlerRouteContent -notmatch [regex]::Escape($oldImport)) {
        Write-Bad "Import requireAuth/requireRole introuvable"
        $hx06Applied = $false
    } else {
        $crawlerRouteContent = $crawlerRouteContent -replace [regex]::Escape($oldImport), $newImport

        # Ajout de strictRateLimiter sur 3 endpoints
        $replacements = @(
            @{
                Old = "router.post('/sources/:id/run', sourcesCtl.triggerSourceRun);"
                New = "router.post('/sources/:id/run', strictRateLimiter, sourcesCtl.triggerSourceRun);"
            },
            @{
                Old = "router.post('/test-generic-html', sourcesCtl.testGenericHtml);"
                New = "router.post('/test-generic-html', strictRateLimiter, sourcesCtl.testGenericHtml);"
            },
            @{
                Old = "router.post('/test-generic-browser', sourcesCtl.testGenericBrowser);"
                New = "router.post('/test-generic-browser', strictRateLimiter, sourcesCtl.testGenericBrowser);"
            }
        )

        $allFound = $true
        foreach ($r in $replacements) {
            if ($crawlerRouteContent -notmatch [regex]::Escape($r.Old)) {
                Write-Bad "Route introuvable : $($r.Old)"
                $allFound = $false
            }
        }

        if ($allFound) {
            foreach ($r in $replacements) {
                $crawlerRouteContent = $crawlerRouteContent -replace [regex]::Escape($r.Old), $r.New
            }
            Save-FileUtf8NoBom -Path $CrawlerRouteFile -Content $crawlerRouteContent
            Write-OK "HX-06 applique : 3 routes protegees (test-generic-html, test-generic-browser, sources/:id/run)"
            $hx06Applied = $true
        } else {
            $hx06Applied = $false
        }
    }
}

# ============================================================================
# HX-07 : Application sur routes/videos.ts
# ============================================================================

Write-Step "4. HX-07 - Application streamingRateLimiter sur /videos/file/:slug"

$videosRouteContent = Get-Content -Path $VideosRouteFile -Raw -Encoding UTF8

if ($videosRouteContent -match "streamingRateLimiter") {
    Write-Skip "HX-07 deja applique sur routes/videos.ts"
    $hx07Applied = $false
} else {
    # Ajout import
    $oldImport = "import { videoAssetUpload } from '../middlewares/video-asset-upload';"
    $newImport = $oldImport + "`r`nimport { streamingRateLimiter } from '../middlewares/rate-limit';"

    if ($videosRouteContent -notmatch [regex]::Escape($oldImport)) {
        Write-Bad "Import videoAssetUpload introuvable"
        $hx07Applied = $false
    } else {
        $videosRouteContent = $videosRouteContent -replace [regex]::Escape($oldImport), $newImport

        # Application sur la route file
        $oldRoute = "router.get('/file/:slug', videosController.getVideoFileBySlug);"
        $newRoute = "router.get('/file/:slug', streamingRateLimiter, videosController.getVideoFileBySlug);"

        if ($videosRouteContent -notmatch [regex]::Escape($oldRoute)) {
            Write-Bad "Route /file/:slug introuvable"
            $hx07Applied = $false
        } else {
            $videosRouteContent = $videosRouteContent -replace [regex]::Escape($oldRoute), $newRoute
            Save-FileUtf8NoBom -Path $VideosRouteFile -Content $videosRouteContent
            Write-OK "HX-07 applique : /videos/file/:slug protege par streamingRateLimiter (60 req/min)"
            $hx07Applied = $true
        }
    }
}

# ============================================================================
# Resume des changements
# ============================================================================

Write-Step "5. Resume des changements"
Write-Info "HX-05 (Playwright)             : $(if ($hx05Applied) { 'APPLIQUE' } else { 'deja applique ou skip' })"
Write-Info "HX-06 (rate-limit test endpoints): $(if ($hx06Applied) { 'APPLIQUE' } else { 'deja applique ou skip' })"
Write-Info "HX-07 (rate-limit public file)  : $(if ($hx07Applied) { 'APPLIQUE' } else { 'deja applique ou skip' })"

if ($DryRun) {
    Write-Info ""
    Write-Info "DRY-RUN termine. Relance sans -DryRun pour appliquer."
    exit 0
}

if (-not ($hx05Applied -or $hx06Applied -or $hx07Applied -or $rateLimiterAdded)) {
    Write-Info ""
    Write-Info "Aucun patch a appliquer (tous deja en place)."
    exit 0
}

# ============================================================================
# Attente redemarrage tsx
# ============================================================================

Write-Step "6. Attente du redemarrage tsx watch (~5s)"
Start-Sleep -Seconds 2
if (-not (Wait-ApiReady -TimeoutSec 20)) {
    Write-Bad "L'API ne repond plus apres patch. Verifie le terminal pnpm dev."
    Write-Info "Rollback : git checkout apps/api/src/middlewares/rate-limit.ts apps/api/src/routes/crawler.ts apps/api/src/routes/videos.ts apps/api/src/services/crawler/adapters/generic-browser-adapter.ts"
    exit 1
}
Write-OK "API a redemarre"

# ============================================================================
# TESTS
# ============================================================================

if ($SkipTests) {
    Write-Step "Tests skippes (-SkipTests)"
    exit 0
}

Write-Step "7. Tests automatises"

$session = Connect-Admin
if (-not $session) {
    Write-Bad "Login impossible - tests ignores"
    exit 1
}
Write-OK "Connecte"

# ----------------------------------------------------------------------------
# Test HX-06 : 11 appels rapides sur test-generic-html → la 11e doit etre 429
# ----------------------------------------------------------------------------
Write-Info ""
Write-Info "Test HX-06 : 12 appels successifs sur /crawler/test-generic-html"

$hx06Statuses = @()
for ($i = 1; $i -le 12; $i++) {
    $body = '{"config":{"url":"https://example.com","videoSelectors":["video"]}}'
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/crawler/test-generic-html" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $hx06Statuses += $r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $hx06Statuses += [int]$_.Exception.Response.StatusCode.value__
        } else {
            $hx06Statuses += 0
        }
    }
}

Write-Info "  Statuses : $($hx06Statuses -join ', ')"
$hx06has429 = $hx06Statuses -contains 429
$hx06FirstNon429 = $hx06Statuses | Select-Object -First 5
$hx06FirstNon429AllValid = ($hx06FirstNon429 | Where-Object { $_ -ne 429 }).Count -ge 4

if ($hx06has429) {
    Write-Fixed "HX-06 verifie : la limite kick (429 dans la sequence)"
} else {
    Write-Bad "HX-06 ECHEC : aucune reponse 429 sur 12 appels"
}

# ----------------------------------------------------------------------------
# Test HX-07 : 65 appels sur /videos/file/<slug-bidon> → la 61e doit etre 429
# ----------------------------------------------------------------------------
Write-Info ""
Write-Info "Test HX-07 : 65 appels rapides sur /videos/file/abc123fakeslug"

$hx07Statuses = @()
for ($i = 1; $i -le 65; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/videos/file/abc123fakeslug" `
            -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        $hx07Statuses += $r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $hx07Statuses += [int]$_.Exception.Response.StatusCode.value__
        } else {
            $hx07Statuses += 0
        }
    }
}

$hx07_404Count = ($hx07Statuses | Where-Object { $_ -eq 404 }).Count
$hx07_429Count = ($hx07Statuses | Where-Object { $_ -eq 429 }).Count
Write-Info "  404 (slug inexistant, attendu): $hx07_404Count"
Write-Info "  429 (rate-limited):             $hx07_429Count"

if ($hx07_429Count -gt 0) {
    Write-Fixed "HX-07 verifie : limite atteinte ($hx07_429Count requetes 429 sur 65)"
} else {
    Write-Bad "HX-07 ECHEC : aucun 429 sur 65 appels"
}

# ----------------------------------------------------------------------------
# Test HX-05 : verification statique (le code n'a plus --no-sandbox)
# ----------------------------------------------------------------------------
Write-Info ""
Write-Info "Test HX-05 : verification statique du code"

$browserContentNow = Get-Content -Path $BrowserAdapterFile -Raw -Encoding UTF8
if ($browserContentNow -match "'--no-sandbox'") {
    Write-Bad "HX-05 ECHEC : --no-sandbox encore present dans le code"
} else {
    Write-Fixed "HX-05 verifie : --no-sandbox absent du code"
}

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT GLOBAL"

$hx05ok = ($browserContentNow -notmatch "'--no-sandbox'")
$hx06ok = $hx06has429
$hx07ok = ($hx07_429Count -gt 0)

Write-Host ""
Write-Host "  HX-05 (Playwright)              : $(if ($hx05ok) { 'OK' } else { 'KO' })" -ForegroundColor $(if ($hx05ok) { 'Green' } else { 'Red' })
Write-Host "  HX-06 (test endpoints rate-lim) : $(if ($hx06ok) { 'OK' } else { 'KO' })" -ForegroundColor $(if ($hx06ok) { 'Green' } else { 'Red' })
Write-Host "  HX-07 (file rate-lim)           : $(if ($hx07ok) { 'OK' } else { 'KO' })" -ForegroundColor $(if ($hx07ok) { 'Green' } else { 'Red' })

Write-Host ""
if ($hx05ok -and $hx06ok -and $hx07ok) {
    Write-Fixed "Lot B/C/D : 3 patches valides"
    Write-Host ""
    Write-Host "Prochaines etapes :" -ForegroundColor Cyan
    Write-Host "  1. git diff (verifie les modifications)" -ForegroundColor Gray
    Write-Host "  2. git add apps/api/src/middlewares/rate-limit.ts apps/api/src/routes/crawler.ts apps/api/src/routes/videos.ts apps/api/src/services/crawler/adapters/generic-browser-adapter.ts" -ForegroundColor Gray
    Write-Host "  3. git commit -m 'security(HX-05/06/07): playwright sandbox + rate-limit endpoints'" -ForegroundColor Gray
    Write-Host "  4. (optionnel) attendre quelques minutes que le rate-limit se reset si tu retestes l'app" -ForegroundColor Gray
    exit 0
} else {
    Write-Bad "Au moins un patch n'a pas pu etre verifie"
    Write-Info "Verifie le code modifie et les logs API"
    exit 2
}
