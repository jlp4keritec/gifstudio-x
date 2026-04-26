#requires -Version 5.1
<#
.SYNOPSIS
    Correctif des bugs du script precedent :
    - HX-05 : applique le patch avec la bonne indentation (6 espaces, pas 4)
    - HX-06 : retest avec la bonne URL (/api/v1/admin/crawler/, pas /api/v1/crawler/)

    Ne touche PAS HX-06/HX-07 qui sont deja correctement appliques cote code.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)   { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Fixed($msg) { Write-Host "  >>> FIX VERIFIE : $msg" -ForegroundColor Green -BackgroundColor DarkGreen }

function New-Banner($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

$BrowserAdapterFile = Join-Path $RepoRoot 'apps\api\src\services\crawler\adapters\generic-browser-adapter.ts'

New-Banner "Correctif HX-05 + retest HX-06"

# ============================================================================
# HX-05 : retry avec regex souple (n'importe quel niveau d'indentation)
# ============================================================================

Write-Step "1. HX-05 - Application avec detection souple de l'indentation"

$content = Get-Content -Path $BrowserAdapterFile -Raw -Encoding UTF8

if ($content -notmatch "'--no-sandbox'") {
    Write-OK "HX-05 deja applique (--no-sandbox absent)"
    $hx05Applied = $true
} else {
    # Pattern qui matche le bloc args: [...] avec n'importe quelle indentation
    # On capture l'indentation pour la respecter dans le replacement
    $pattern = "(?s)([ \t]+)args:\s*\[\s*'--no-sandbox',\s*\n([ \t]+)'--disable-blink-features=AutomationControlled',\s*\n([ \t]+)'--disable-dev-shm-usage',\s*\n([ \t]+)\],"

    $contentNorm = $content -replace "`r`n", "`n"

    if ($contentNorm -match $pattern) {
        Write-Info "Pattern matche - indentation detectee"
        $indent = $matches[1]
        Write-Info "Indentation des args : $($indent.Length) caractere(s)"

        $innerIndent = $matches[2]

        $replacement = @"
${indent}// [Patch HX-05] --no-sandbox retire ; sandbox utilisateur active
${indent}args: [
${innerIndent}'--disable-blink-features=AutomationControlled',
${innerIndent}'--disable-dev-shm-usage',
${innerIndent}'--disable-extensions',
${innerIndent}'--disable-plugins',
${innerIndent}'--disable-software-rasterizer',
${innerIndent}'--mute-audio',
${innerIndent}'--no-first-run',
${innerIndent}'--no-default-browser-check',
${innerIndent}'--disable-features=IsolateOrigins,site-per-process,TranslateUI',
${innerIndent}'--disable-background-networking',
${indent}],
"@

        $contentNorm = $contentNorm -replace $pattern, $replacement
        $contentFinal = $contentNorm -replace "`n", "`r`n"

        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($BrowserAdapterFile, $contentFinal, $utf8NoBom)
        Write-OK "HX-05 applique"
        $hx05Applied = $true
    } else {
        Write-Bad "Pattern toujours non matche"
        Write-Info "Contenu actuel du bloc args (recherche manuelle) :"
        # Afficher le bloc pour debug
        $debugMatch = [regex]::Match($contentNorm, "(?s)args:\s*\[(.*?)\],")
        if ($debugMatch.Success) {
            Write-Info "<<<<<<<<<<<<<<<<<<<<"
            Write-Host $debugMatch.Value -ForegroundColor Yellow
            Write-Info ">>>>>>>>>>>>>>>>>>>>"
        }
        $hx05Applied = $false
    }
}

# ============================================================================
# Attente redemarrage tsx (si modif)
# ============================================================================

if ($hx05Applied) {
    Write-Step "2. Attente du redemarrage tsx watch"
    Start-Sleep -Seconds 2
    $apiReady = $false
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt 15) {
        Start-Sleep -Seconds 1
        try {
            $h = Invoke-WebRequest -Uri "$ApiUrl/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($h.StatusCode -eq 200) { $apiReady = $true; break }
        } catch { }
    }
    if ($apiReady) { Write-OK "API redemarree" } else { Write-Bad "API ne repond plus" }
}

# ============================================================================
# Verification statique HX-05
# ============================================================================

Write-Step "3. Verification statique HX-05"

$contentNow = Get-Content -Path $BrowserAdapterFile -Raw -Encoding UTF8
if ($contentNow -match "'--no-sandbox'") {
    Write-Bad "--no-sandbox encore present"
    $hx05Verified = $false
} else {
    Write-Fixed "--no-sandbox absent du code"
    $hx05Verified = $true
}

# ============================================================================
# Retest HX-06 avec la BONNE URL
# ============================================================================

Write-Step "4. Retest HX-06 avec /api/v1/admin/crawler/test-generic-html"

# Login
$loginBody = @{ identifier = $AdminEmail; password = $AdminPassword } | ConvertTo-Json -Compress
$session = $null
try {
    Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' -Body $loginBody `
        -SessionVariable session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    Write-OK "Login OK"
} catch {
    Write-Bad "Login KO"
    exit 1
}

Write-Info "12 appels successifs sur /api/v1/admin/crawler/test-generic-html"
$statuses = @()
for ($i = 1; $i -le 12; $i++) {
    $body = '{"config":{"url":"https://example.com","videoSelectors":["video"]}}'
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/admin/crawler/test-generic-html" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $statuses += $r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $statuses += [int]$_.Exception.Response.StatusCode.value__
        } else {
            $statuses += 0
        }
    }
}

Write-Info "  Statuses : $($statuses -join ', ')"
$hx06has429 = $statuses -contains 429

if ($hx06has429) {
    Write-Fixed "HX-06 verifie : 429 dans la sequence"
    $hx06Verified = $true
} else {
    Write-Bad "HX-06 : pas de 429 sur 12 appels"
    Write-Info "Pour info, premier body recu :"
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/admin/crawler/test-generic-html" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        Write-Info "  Status: $($r.StatusCode), Body: $($r.Content)"
    } catch {
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                Write-Info "  Status: $([int]$_.Exception.Response.StatusCode.value__), Body: $($reader.ReadToEnd())"
                $reader.Close()
            } catch { }
        }
    }
    $hx06Verified = $false
}

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT FINAL"

Write-Host ""
Write-Host "  HX-05 (Playwright)              : $(if ($hx05Verified) { 'OK' } else { 'KO' })" -ForegroundColor $(if ($hx05Verified) { 'Green' } else { 'Red' })
Write-Host "  HX-06 (rate-lim test endpoints) : $(if ($hx06Verified) { 'OK' } else { 'KO' })" -ForegroundColor $(if ($hx06Verified) { 'Green' } else { 'Red' })
Write-Host "  HX-07 (rate-lim file)           : OK (verifie au run precedent)" -ForegroundColor Green

Write-Host ""
if ($hx05Verified -and $hx06Verified) {
    Write-Fixed "Tous les patches Lot B/C/D valides"
    Write-Host ""
    Write-Host "Commit suggere :" -ForegroundColor Cyan
    Write-Host "  git add apps/api/src/middlewares/rate-limit.ts apps/api/src/routes/crawler.ts apps/api/src/routes/videos.ts apps/api/src/services/crawler/adapters/generic-browser-adapter.ts" -ForegroundColor Gray
    Write-Host "  git commit -m 'security(HX-05/06/07): playwright sandbox + rate-limit endpoints'" -ForegroundColor Gray
    exit 0
} else {
    Write-Bad "Au moins un patch n'est pas valide"
    exit 2
}
