#requires -Version 5.1
<#
.SYNOPSIS
    Patch HX-01 SSRF + tests automatises avant/apres.

.DESCRIPTION
    1. Verifie que l'API tourne sur localhost:4003
    2. Login admin -> recupere le cookie automatiquement
    3. TEST AVANT PATCH : tente SSRF vers localhost:5432 -> doit reussir le contact (vuln)
    4. Cree apps/api/src/lib/url-security.ts
    5. Modifie apps/api/src/services/video-import-service.ts
    6. Attend que tsx watch redemarre l'API (~3s)
    7. Re-login (le redemarrage perd la connexion)
    8. TEST APRES PATCH : meme SSRF -> doit etre bloque
    9. Test de non-regression : URL publique legitime doit toujours marcher
    10. Affiche le verdict

.EXAMPLE
    cd C:\gifstudio-x
    .\patch-hx01.ps1

.PARAMETER RepoRoot
    Racine du repo gifstudio-x (defaut: dossier courant)

.PARAMETER ApiUrl
    URL de l'API (defaut: http://localhost:4003)

.PARAMETER AdminEmail
    Email admin (defaut: admin@gifstudio-x.local)

.PARAMETER AdminPassword
    Mot de passe admin (defaut: AdminX123)

.PARAMETER DryRun
    Ne modifie rien, montre juste ce qui serait fait
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ============================================================================
# HELPERS DE PRESENTATION
# ============================================================================

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Vuln($msg) {
    Write-Host "  >>> VULN CONFIRMEE : $msg" -ForegroundColor Magenta
}
function Write-Fixed($msg) {
    Write-Host "  >>> FIX VERIFIE : $msg" -ForegroundColor Green -BackgroundColor DarkGreen
}

function New-Banner($title) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

# ============================================================================
# CHEMINS
# ============================================================================

$ApiDir = Join-Path $RepoRoot 'apps\api'
$LibDir = Join-Path $ApiDir 'src\lib'
$UrlSecurityFile = Join-Path $LibDir 'url-security.ts'
$VideoImportFile = Join-Path $ApiDir 'src\services\video-import-service.ts'

# ============================================================================
# 0. PRE-VOLS
# ============================================================================

New-Banner "Patch HX-01 - SSRF sur validateVideoUrl"

Write-Step "0. Verifications prealables"

if (-not (Test-Path $ApiDir)) {
    Write-Bad "Dossier introuvable : $ApiDir"
    Write-Info "Lance le script depuis la racine du repo gifstudio-x, ou utilise -RepoRoot"
    exit 1
}
Write-OK "Repo trouve : $RepoRoot"

if (-not (Test-Path $VideoImportFile)) {
    Write-Bad "Fichier cible introuvable : $VideoImportFile"
    exit 1
}
Write-OK "Fichier cible : $VideoImportFile"

# Verif que API tourne
try {
    $health = Invoke-WebRequest -Uri "$ApiUrl/api/v1/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        Write-OK "API repond sur $ApiUrl"
    }
} catch {
    Write-Bad "API ne repond pas sur $ApiUrl"
    Write-Info "Demarre l'API avec : pnpm dev (laisse le terminal ouvert)"
    Write-Info "Puis relance ce script."
    exit 1
}

# ============================================================================
# HELPERS DE TEST
# ============================================================================

function Connect-Admin {
    [OutputType([Microsoft.PowerShell.Commands.WebRequestSession])]
    param()

    $loginBody = @{
        identifier = $AdminEmail
        password   = $AdminPassword
    } | ConvertTo-Json -Compress

    $session = $null
    $response = $null

    try {
        $response = Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
            -Method POST `
            -ContentType 'application/json' `
            -Body $loginBody `
            -SessionVariable session `
            -UseBasicParsing `
            -TimeoutSec 10 `
            -ErrorAction Stop
    } catch {
        Write-Bad "Login echoue : $($_.Exception.Message)"
        Write-Info "Verifie tes identifiants admin (-AdminEmail, -AdminPassword)"
        Write-Info "Email tente : $AdminEmail"
        return $null
    }

    if ($response.StatusCode -ne 200) {
        Write-Bad "Login retourne status $($response.StatusCode)"
        return $null
    }
    return $session
}

function Test-Ssrf {
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)][string]$TargetUrl,
        [string]$Label
    )

    $body = @{ url = $TargetUrl } | ConvertTo-Json -Compress
    $result = @{
        TargetUrl = $TargetUrl
        Label = $Label
        StatusCode = 0
        Body = ''
        Error = ''
        ContactedTarget = $false
        BlockedBySSrfCheck = $false
        DurationMs = 0
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-WebRequest -Uri "$ApiUrl/api/v1/videos/import-url" `
            -Method POST `
            -ContentType 'application/json' `
            -Body $body `
            -WebSession $Session `
            -UseBasicParsing `
            -TimeoutSec 15 `
            -ErrorAction Stop
        $result.StatusCode = $resp.StatusCode
        $result.Body = $resp.Content
    } catch [System.Net.WebException] {
        # WebException : capture le status + body meme en cas d'erreur 4xx/5xx
        if ($_.Exception.Response) {
            $result.StatusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $result.Body = $reader.ReadToEnd()
                $reader.Close()
            } catch { }
        } else {
            $result.Error = $_.Exception.Message
        }
    } catch {
        # Invoke-WebRequest 4xx/5xx en PS5
        if ($_.Exception.Response) {
            $result.StatusCode = [int]$_.Exception.Response.StatusCode.value__
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $result.Body = $reader.ReadToEnd()
                $reader.Close()
            } catch { }
        }
        if (-not $result.StatusCode) {
            $result.Error = $_.Exception.Message
        }
    }
    $sw.Stop()
    $result.DurationMs = $sw.ElapsedMilliseconds

    # Analyse du body pour determiner le verdict
    $bodyLower = ($result.Body + '').ToLower()

    # Indicateurs que la SSRF a ete bloquee par notre check
    $ssrfBlockMarkers = @(
        'host prive',
        'host privé',
        'invalid_url',
        'host_forbidden'
    )
    $result.BlockedBySSrfCheck = $false
    foreach ($m in $ssrfBlockMarkers) {
        if ($bodyLower -match [regex]::Escape($m)) {
            $result.BlockedBySSrfCheck = $true
            break
        }
    }

    # Indicateurs que l'API a CONTACTE la cible (donc vuln)
    # = body parle de Content-Type ou de validation video, pas de SSRF
    $contactMarkers = @(
        'unsupported_mime',
        'type de contenu',
        'pas une video',
        'invalid_video',
        'file_too_large',
        'download_failed',
        'probe_failed',
        'host_not_found',
        'conn_refused'
    )
    foreach ($m in $contactMarkers) {
        if ($bodyLower -match [regex]::Escape($m)) {
            $result.ContactedTarget = $true
            break
        }
    }
    # Status 500 = exception non geree apres tentative -> aussi un contact
    if ($result.StatusCode -ge 500 -and -not $result.BlockedBySSrfCheck) {
        $result.ContactedTarget = $true
    }
    # Duree > 1500 ms sur localhost = il y a eu un timeout ou un fetch reseau reel
    if ($result.DurationMs -gt 1500 -and -not $result.BlockedBySSrfCheck) {
        $result.ContactedTarget = $true
    }

    return $result
}

function Show-TestResult {
    param(
        [Parameter(Mandatory)][hashtable]$R,
        [string]$Phase
    )
    Write-Info "[$Phase] $($R.Label)"
    Write-Info "        URL cible    : $($R.TargetUrl)"
    Write-Info "        Status       : $($R.StatusCode)"
    Write-Info "        Duree        : $($R.DurationMs) ms"
    if ($R.Body) {
        $bodyShort = $R.Body
        if ($bodyShort.Length -gt 200) { $bodyShort = $bodyShort.Substring(0, 200) + '...' }
        Write-Info "        Body         : $bodyShort"
    }
    if ($R.Error) {
        Write-Info "        Erreur reseau: $($R.Error)"
    }
}

# ============================================================================
# 1. TEST AVANT PATCH
# ============================================================================

Write-Step "1. Test SSRF AVANT patch"

$session = Connect-Admin
if (-not $session) { exit 1 }
Write-OK "Connecte"

$beforeResult = Test-Ssrf -Session $session `
    -TargetUrl "http://localhost:5432/" `
    -Label "SSRF vers Postgres local (port 5432)"

Show-TestResult -R $beforeResult -Phase "AVANT"

if ($beforeResult.BlockedBySSrfCheck) {
    Write-Warn "L'API a deja une protection SSRF active. Le patch HX-01 a peut-etre deja ete applique ?"
    Write-Info "Pas de modification - le script s'arrete."
    exit 0
}

if ($beforeResult.ContactedTarget) {
    Write-Vuln "L'API a contacte localhost:5432 (HX-01 confirmee)"
} else {
    Write-Warn "Resultat ambigu - on patche quand meme par precaution."
}

# ============================================================================
# 2. APPLICATION DU PATCH
# ============================================================================

Write-Step "2. Application du patch HX-01"

if ($DryRun) {
    Write-Warn "DRY-RUN : aucune modification ne sera ecrite"
}

# 2.1 Creation de url-security.ts
Write-Info "Creation de $UrlSecurityFile"

$urlSecurityCode = @'
// ============================================================================
// url-security.ts - Protection anti-SSRF (Patch HX-01)
//
// Genere par patch-hx01.ps1 le %DATE%
// Voir docs/security/patches/HX-01-ssrf-import-video.patch.md pour le detail.
// ============================================================================
import dns from 'node:dns/promises';

/**
 * Verifie si une IP appartient a une plage privee/reservee/loopback.
 * Couvre IPv4 + IPv6 (loopback, link-local, ULA, IPv4-mapped, etc.)
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p > 255 || p < 0)) return true;

    const [a, b] = parts;
    if (a === 0) return true;                          // 0.0.0.0/8
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                         // multicast + reserved
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;

  // IPv4-mapped : ::ffff:X.X.X.X
  const v4mapMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapMatch) return isPrivateIp(v4mapMatch[1]);

  // IPv4-mapped hex : ::ffff:7f00:1
  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const a = parseInt(hexMatch[1], 16);
    const b = parseInt(hexMatch[2], 16);
    return isPrivateIp(`${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`);
  }

  // 0:0:0:0:0:0:0:1 forme expanded
  const expanded = lower.split(':');
  if (
    expanded.length === 8 &&
    expanded.slice(0, 7).every((p) => p === '0' || p === '0000') &&
    (expanded[7] === '1' || expanded[7] === '0001')
  ) {
    return true;
  }

  return false;
}

/**
 * Valide qu'une URL est publique (protocole http/https + host non prive).
 * Ne resout PAS le DNS (voir resolvePublicUrl pour la version anti-rebinding).
 */
export function assertPublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL invalide');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Protocole non autorise (http/https uniquement)');
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  const FORBIDDEN_HOSTNAMES = ['localhost', 'ip6-localhost', 'ip6-loopback', 'broadcasthost'];
  if (FORBIDDEN_HOSTNAMES.includes(host)) {
    throw new Error(`Host prive non autorise : ${host}`);
  }

  // Si c'est deja une IP, verifier directement
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) {
      throw new Error(`Host prive non autorise : ${host}`);
    }
  }

  // Domaines wildcard publics qui resolvent en local
  const SUSPICIOUS_DOMAINS = ['nip.io', 'sslip.io', 'localtest.me', 'lvh.me'];
  for (const sus of SUSPICIOUS_DOMAINS) {
    if (host.endsWith(`.${sus}`) || host === sus) {
      throw new Error(`Domaine suspect non autorise : ${host}`);
    }
  }

  return parsed;
}

/**
 * Variante anti-DNS-rebinding : resout le DNS et verifie chaque IP.
 * A utiliser avant les fetches sensibles.
 */
export async function resolvePublicUrl(rawUrl: string): Promise<{
  url: URL;
  resolvedIp: string;
  family: 4 | 6;
}> {
  const parsed = assertPublicUrl(rawUrl);
  const host = parsed.hostname.replace(/\.+$/, '');

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { url: parsed, resolvedIp: host, family: 4 };
  }
  if (host.includes(':')) {
    return { url: parsed, resolvedIp: host, family: 6 };
  }

  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`Aucune IP resolue pour ${host}`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr.address)) {
      throw new Error(
        `Host prive detecte apres resolution DNS : ${host} -> ${addr.address}`,
      );
    }
  }

  return {
    url: parsed,
    resolvedIp: addresses[0].address,
    family: addresses[0].family as 4 | 6,
  };
}
'@.Replace('%DATE%', (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

if (-not $DryRun) {
    if (-not (Test-Path $LibDir)) {
        New-Item -ItemType Directory -Path $LibDir -Force | Out-Null
    }
    # Encodage UTF-8 sans BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($UrlSecurityFile, $urlSecurityCode, $utf8NoBom)
    Write-OK "Cree : url-security.ts"
} else {
    Write-Info "[DRY-RUN] Aurait cree : $UrlSecurityFile"
}

# 2.2 Modification de video-import-service.ts
Write-Info "Modification de $VideoImportFile"

$videoImportContent = Get-Content -Path $VideoImportFile -Raw -Encoding UTF8

# Marqueur d'idempotence : si deja patche, ne rien faire
if ($videoImportContent -match "from '\.\./lib/url-security'") {
    Write-Warn "Le fichier semble deja patche (import url-security present)"
} else {
    # Ajout de l'import apres les imports existants
    $importMarker = "import { resolveVideoUrl, needsResolution } from './url-resolver';"
    $importNew = $importMarker + "`r`nimport { assertPublicUrl } from '../lib/url-security';"

    if ($videoImportContent -notmatch [regex]::Escape($importMarker)) {
        Write-Bad "Marqueur d'import introuvable. Le fichier a peut-etre evolue."
        Write-Info "Recherche : $importMarker"
        exit 1
    }

    $videoImportContent = $videoImportContent -replace [regex]::Escape($importMarker), $importNew

    # Remplacement du bloc de validation URL initial
    # Pattern : "let parsed: URL;\s+try {\s+parsed = new URL(url);\s+} catch {[^}]*}\s+if \(![^)]*protocol[^}]*}"

    $oldBlock = @'
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, 'URL invalide', 'INVALID_URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'Seuls http et https sont autorises', 'INVALID_PROTOCOL');
  }
'@

    $newBlock = @'
  // [Patch HX-01] Validation SSRF : refuse les hosts prives, loopback, cloud metadata
  let parsed: URL;
  try {
    parsed = assertPublicUrl(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'URL invalide';
    throw new AppError(400, msg, 'INVALID_URL');
  }
'@

    # Normaliser les fins de ligne dans le fichier source pour matcher
    $needle = $oldBlock -replace "`r`n", "`n"
    $haystack = $videoImportContent -replace "`r`n", "`n"

    if ($haystack -notmatch [regex]::Escape($needle)) {
        Write-Bad "Bloc de validation initial introuvable dans le fichier."
        Write-Info "Le fichier a probablement evolue depuis la version auditee."
        Write-Info "Patch manuel necessaire - voir docs/security/patches/HX-01-ssrf-import-video.patch.md"
        exit 1
    }

    $haystack = $haystack -replace [regex]::Escape($needle), $newBlock
    $videoImportContent = $haystack -replace "`n", "`r`n"

    if (-not $DryRun) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($VideoImportFile, $videoImportContent, $utf8NoBom)
        Write-OK "Modifie : video-import-service.ts"
    } else {
        Write-Info "[DRY-RUN] Aurait modifie : $VideoImportFile"
    }
}

if ($DryRun) {
    Write-Info ""
    Write-Info "DRY-RUN termine. Relance sans -DryRun pour appliquer."
    exit 0
}

# ============================================================================
# 3. ATTENTE REDEMARRAGE TSX
# ============================================================================

Write-Step "3. Attente du redemarrage de l'API (tsx watch)"
Write-Info "tsx detecte les changements et redemarre automatiquement..."

$apiReady = $false
$start = Get-Date
while (((Get-Date) - $start).TotalSeconds -lt 15) {
    Start-Sleep -Seconds 1
    try {
        $h = Invoke-WebRequest -Uri "$ApiUrl/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($h.StatusCode -eq 200) {
            $apiReady = $true
            break
        }
    } catch { }
}

if (-not $apiReady) {
    Write-Bad "L'API ne repond plus apres le patch."
    Write-Info "Verifie le terminal pnpm dev pour des erreurs de compilation TypeScript."
    Write-Info "En cas d'erreur, restaure les fichiers :"
    Write-Info "  git checkout apps/api/src/services/video-import-service.ts"
    Write-Info "  git rm apps/api/src/lib/url-security.ts"
    exit 1
}
Write-OK "API redemarree et repond"

# ============================================================================
# 4. TESTS APRES PATCH
# ============================================================================

Write-Step "4. Tests SSRF APRES patch"

$session = Connect-Admin
if (-not $session) { exit 1 }
Write-OK "Re-connecte (le redemarrage a coupe la session)"

# 4.1 SSRF doit etre bloquee
$afterResult = Test-Ssrf -Session $session `
    -TargetUrl "http://localhost:5432/" `
    -Label "SSRF vers Postgres local"

Show-TestResult -R $afterResult -Phase "APRES"

# 4.2 Variantes : 127.0.0.1
$test127 = Test-Ssrf -Session $session `
    -TargetUrl "http://127.0.0.1:5432/" `
    -Label "SSRF vers 127.0.0.1"
Show-TestResult -R $test127 -Phase "APRES"

# 4.3 Variante : IPv6 loopback
$testIpv6 = Test-Ssrf -Session $session `
    -TargetUrl "http://[::1]:5432/" `
    -Label "SSRF vers IPv6 loopback"
Show-TestResult -R $testIpv6 -Phase "APRES"

# 4.4 Variante : 169.254.169.254 (cloud metadata)
$testMeta = Test-Ssrf -Session $session `
    -TargetUrl "http://169.254.169.254/latest/meta-data/" `
    -Label "SSRF vers cloud metadata service"
Show-TestResult -R $testMeta -Phase "APRES"

# 4.5 Test de NON-regression : URL publique (doit etre acceptee)
$publicTest = Test-Ssrf -Session $session `
    -TargetUrl "https://www.example.com/inexistant.mp4" `
    -Label "URL publique legitime (doit passer la validation SSRF)"
Show-TestResult -R $publicTest -Phase "APRES"

# ============================================================================
# 5. VERDICT FINAL
# ============================================================================

New-Banner "VERDICT"

$ssrfBlocked = $afterResult.BlockedBySSrfCheck -and `
               $test127.BlockedBySSrfCheck -and `
               $testIpv6.BlockedBySSrfCheck -and `
               $testMeta.BlockedBySSrfCheck

# URL publique : doit NE PAS etre bloquee par check SSRF (mais peut echouer pour 404 ou autre)
$publicOK = -not $publicTest.BlockedBySSrfCheck

Write-Host ""
Write-Host "Resultats des 4 tests SSRF (doivent tous etre BLOQUES) :" -ForegroundColor Yellow
Write-Host ("  localhost:5432       : " + $(if ($afterResult.BlockedBySSrfCheck) { "BLOQUE [OK]" } else { "PASSE [KO]" })) -ForegroundColor $(if ($afterResult.BlockedBySSrfCheck) { 'Green' } else { 'Red' })
Write-Host ("  127.0.0.1:5432       : " + $(if ($test127.BlockedBySSrfCheck) { "BLOQUE [OK]" } else { "PASSE [KO]" })) -ForegroundColor $(if ($test127.BlockedBySSrfCheck) { 'Green' } else { 'Red' })
Write-Host ("  [::1]:5432           : " + $(if ($testIpv6.BlockedBySSrfCheck) { "BLOQUE [OK]" } else { "PASSE [KO]" })) -ForegroundColor $(if ($testIpv6.BlockedBySSrfCheck) { 'Green' } else { 'Red' })
Write-Host ("  169.254.169.254      : " + $(if ($testMeta.BlockedBySSrfCheck) { "BLOQUE [OK]" } else { "PASSE [KO]" })) -ForegroundColor $(if ($testMeta.BlockedBySSrfCheck) { 'Green' } else { 'Red' })

Write-Host ""
Write-Host "Test de non-regression (URL publique doit passer la validation SSRF) :" -ForegroundColor Yellow
Write-Host ("  example.com         : " + $(if ($publicOK) { "OK [check non bloque]" } else { "KO [bloque a tort]" })) -ForegroundColor $(if ($publicOK) { 'Green' } else { 'Red' })

Write-Host ""
if ($ssrfBlocked -and $publicOK) {
    Write-Fixed "HX-01 corrige avec succes !"
    Write-Host ""
    Write-Host "Prochaines etapes recommandees :" -ForegroundColor Cyan
    Write-Host "  1. Verifier le diff : git diff apps/api/src/services/video-import-service.ts" -ForegroundColor Gray
    Write-Host "  2. Commit : git add apps/api/src/lib/url-security.ts apps/api/src/services/video-import-service.ts" -ForegroundColor Gray
    Write-Host "             git commit -m 'security(HX-01): block SSRF on validateVideoUrl'" -ForegroundColor Gray
    Write-Host "  3. Continuer avec HX-02/03/04 (DNS rebinding, redirections, IPv6 complet)" -ForegroundColor Gray
    exit 0
} else {
    Write-Bad "Le patch ne couvre pas tous les cas attendus."
    if (-not $afterResult.BlockedBySSrfCheck) { Write-Info "  - localhost:5432 passe encore" }
    if (-not $test127.BlockedBySSrfCheck) { Write-Info "  - 127.0.0.1 passe encore" }
    if (-not $testIpv6.BlockedBySSrfCheck) { Write-Info "  - IPv6 [::1] passe encore" }
    if (-not $testMeta.BlockedBySSrfCheck) { Write-Info "  - cloud metadata passe encore" }
    if (-not $publicOK) { Write-Info "  - URL publique bloquee a tort (faux positif)" }
    Write-Host ""
    Write-Info "Pour rollback : git checkout apps/api/src/services/video-import-service.ts && git rm apps/api/src/lib/url-security.ts"
    exit 2
}
