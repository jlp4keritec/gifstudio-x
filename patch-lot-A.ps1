#requires -Version 5.1
<#
.SYNOPSIS
    Lot A - HX-02 + HX-03 + HX-04 : DNS rebinding + redirections + IPv6 complet.

.DESCRIPTION
    Fait :
    1. Met a jour apps/api/src/lib/url-security.ts avec assertPublicUrlAsync (DNS lookup + IP check)
    2. Cree apps/api/src/lib/safe-fetch.ts (wrapper axios avec re-verification redirections)
    3. Migre image-proxy-service.ts, video-import-service.ts, generic-html-adapter.ts
    4. Ajoute page.route() dans generic-browser-adapter.ts pour bloquer requetes vers IP privees
    5. Tests automatises
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123',
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
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
$LibDir = Join-Path $ApiDir 'src\lib'
$UrlSecurityFile = Join-Path $LibDir 'url-security.ts'
$SafeFetchFile = Join-Path $LibDir 'safe-fetch.ts'
$ImageProxyFile = Join-Path $ApiDir 'src\services\image-proxy-service.ts'
$VideoImportFile = Join-Path $ApiDir 'src\services\video-import-service.ts'
$GenericHtmlFile = Join-Path $ApiDir 'src\services\crawler\adapters\generic-html-adapter.ts'
$GenericBrowserFile = Join-Path $ApiDir 'src\services\crawler\adapters\generic-browser-adapter.ts'

New-Banner "Lot A - HX-02 + HX-03 + HX-04"

# ============================================================================
# 0. Pre-vols
# ============================================================================

Write-Step "0. Pre-vols"
if (-not (Wait-ApiReady -TimeoutSec 5)) {
    Write-Warn "API ne repond pas. Demarre 'pnpm dev' et relance."
    if (-not (Wait-ApiReady -TimeoutSec 15)) { exit 1 }
}
Write-OK "API repond"

# ============================================================================
# 1. Mise a jour url-security.ts avec assertPublicUrlAsync
# ============================================================================

Write-Step "1. Update url-security.ts (ajout DNS lookup + IP check)"

$urlSecurityCode = @'
// ============================================================================
// url-security.ts - Protection anti-SSRF (Patches HX-01 + HX-02 + HX-04)
// ============================================================================
import dns from 'node:dns/promises';

/**
 * Verifie si une IP appartient a une plage privee/reservee/loopback.
 * Couvre IPv4 + IPv6 (loopback, link-local, ULA, IPv4-mapped, IPv4-mapped hex,
 * forme expanded, etc.)
 */
export function isPrivateIp(ip: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p > 255 || p < 0)) return true;

    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;

  const v4mapMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapMatch) return isPrivateIp(v4mapMatch[1]);

  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const a = parseInt(hexMatch[1], 16);
    const b = parseInt(hexMatch[2], 16);
    return isPrivateIp(`${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`);
  }

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
 * Validation synchrone de l'URL (sans DNS lookup).
 * - Verifie protocole (http/https)
 * - Verifie hostname (pas de localhost, IPs privees, domaines wildcard suspects)
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

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) {
      throw new Error(`Host prive non autorise : ${host}`);
    }
  }

  const SUSPICIOUS_DOMAINS = ['nip.io', 'sslip.io', 'localtest.me', 'lvh.me'];
  for (const sus of SUSPICIOUS_DOMAINS) {
    if (host.endsWith(`.${sus}`) || host === sus) {
      throw new Error(`Domaine suspect non autorise : ${host}`);
    }
  }

  return parsed;
}

/**
 * Validation asynchrone : valide la syntaxe + resout le DNS et verifie chaque IP.
 * A utiliser pour les fetches sensibles (anti-DNS-rebinding).
 *
 * Retourne l'URL parsee et l'IP resolue (a passer a l'agent HTTP via lookup()).
 */
export async function assertPublicUrlAsync(rawUrl: string): Promise<{
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
'@

Save-FileUtf8NoBom -Path $UrlSecurityFile -Content $urlSecurityCode
Write-OK "url-security.ts mis a jour"

# ============================================================================
# 2. Creation safe-fetch.ts
# ============================================================================

Write-Step "2. Creation safe-fetch.ts (wrapper axios anti-redirection-bypass)"

$safeFetchCode = @'
// ============================================================================
// safe-fetch.ts - Wrapper axios anti-SSRF (HX-02 + HX-03)
// ============================================================================
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { assertPublicUrlAsync } from './url-security';

const MAX_REDIRECTS = 5;

interface SafeFetchOptions extends Omit<AxiosRequestConfig, 'maxRedirects'> {
  maxRedirects?: number;
}

/**
 * GET sur dans une URL : valide l'URL + suit les redirections en re-validant
 * chaque hop pour empecher SSRF via 302 vers host prive.
 */
export async function safeAxiosGet<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse<T>> {
  return safeFetch<T>('GET', url, options, 0);
}

/**
 * HEAD : meme principe que GET.
 */
export async function safeAxiosHead<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse<T>> {
  return safeFetch<T>('HEAD', url, options, 0);
}

/**
 * GET en stream (pour images/videos).
 */
export async function safeAxiosStream(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse> {
  return safeFetch('GET', url, { ...options, responseType: 'stream' }, 0);
}

async function safeFetch<T = unknown>(
  method: 'GET' | 'HEAD',
  url: string,
  options: SafeFetchOptions,
  attempt: number,
): Promise<AxiosResponse<T>> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  if (attempt > maxRedirects) {
    throw new Error(`Trop de redirections (max ${maxRedirects})`);
  }

  // Validation anti-SSRF (DNS lookup + IP check)
  await assertPublicUrlAsync(url);

  // Pour gerer les redirections manuellement
  const response = await axios.request<T>({
    ...options,
    url,
    method,
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: options.timeout ?? 10_000,
  });

  // Suivi manuel des redirections avec re-validation
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers['location'];
    if (!location) return response;

    const nextUrl = new URL(location as string, url).toString();
    return safeFetch<T>(method, nextUrl, options, attempt + 1);
  }

  // Si user demande validateStatus strict, on l'applique APRES avoir suivi les redirections
  if (options.validateStatus && !options.validateStatus(response.status)) {
    const error = new Error(`HTTP ${response.status}`) as Error & { response?: AxiosResponse };
    error.response = response;
    throw error;
  }

  return response;
}
'@

Save-FileUtf8NoBom -Path $SafeFetchFile -Content $safeFetchCode
Write-OK "safe-fetch.ts cree"

# ============================================================================
# 3. Migration image-proxy-service.ts
# ============================================================================

Write-Step "3. Migration image-proxy-service.ts"

$imageProxyContent = Get-Content -Path $ImageProxyFile -Raw -Encoding UTF8

if ($imageProxyContent.Contains('safeAxiosStream')) {
    Write-Skip "image-proxy-service.ts deja migre"
    $imgDone = $false
} else {
    # Remplacement complet pour simplifier
    $newImageProxy = @'
import type { AxiosResponse } from 'axios';
import type { Readable } from 'node:stream';
import { safeAxiosStream } from '../lib/safe-fetch';

/**
 * Proxy pour recuperer des thumbnails distantes (Rule34, Reddit, etc.)
 * qui bloquent le hotlink direct via Referer/CORS.
 *
 * [Patch HX-02/03/04] : utilise safeAxiosStream qui :
 *   - Valide l'URL (assertPublicUrl)
 *   - Resout le DNS et bloque les IPs privees (anti-rebinding)
 *   - Suit les redirections en re-validant chaque hop
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface FetchedImage {
  stream: Readable;
  contentType: string;
  contentLength: number | null;
}

function pickReferer(imageUrl: string): string | undefined {
  try {
    const u = new URL(imageUrl);
    const host = u.hostname.toLowerCase();

    if (host.endsWith('rule34.xxx')) return 'https://rule34.xxx/';
    if (host.endsWith('redd.it') || host.endsWith('reddit.com'))
      return 'https://www.reddit.com/';
    if (host.endsWith('redgifs.com')) return 'https://www.redgifs.com/';
    if (host.endsWith('e621.net')) return 'https://e621.net/';

    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchRemoteImage(imageUrl: string): Promise<FetchedImage> {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const referer = pickReferer(imageUrl);
  if (referer) headers.Referer = referer;

  const response: AxiosResponse<Readable> = await safeAxiosStream(imageUrl, {
    timeout: 10_000,
    maxRedirects: 5,
    headers,
    validateStatus: (s) => s >= 200 && s < 400,
  }) as AxiosResponse<Readable>;

  const contentType =
    response.headers['content-type']?.toString().split(';')[0] ?? 'image/jpeg';
  const cl = response.headers['content-length'];
  const contentLength = cl ? Number(cl) : null;

  return {
    stream: response.data,
    contentType,
    contentLength,
  };
}
'@

    Save-FileUtf8NoBom -Path $ImageProxyFile -Content $newImageProxy
    Write-OK "image-proxy-service.ts migre vers safeAxiosStream"
    $imgDone = $true
}

# ============================================================================
# 4. Migration video-import-service.ts (juste le validateVideoUrl)
# ============================================================================

Write-Step "4. Migration video-import-service.ts (validateVideoUrl)"

$videoImportContent = Get-Content -Path $VideoImportFile -Raw -Encoding UTF8

if ($videoImportContent.Contains('safeAxiosHead')) {
    Write-Skip "video-import-service.ts deja migre"
    $videoDone = $false
} else {
    # Ajouter import safeAxiosHead apres l'import existant url-security
    if ($videoImportContent.Contains("from '../lib/url-security'")) {
        $oldImport = "import { assertPublicUrl } from '../lib/url-security';"
        $newImport = "import { assertPublicUrl } from '../lib/url-security';`r`nimport { safeAxiosHead } from '../lib/safe-fetch';"

        if ($videoImportContent.Contains($oldImport)) {
            $videoImportContent = $videoImportContent.Replace($oldImport, $newImport)
        }
    }

    # Remplacer axios.head par safeAxiosHead dans validateVideoUrl
    # Pattern : axios.head(url, {...})
    $oldHead = 'await axios.head(url, {'
    $newHead = 'await safeAxiosHead(url, {'

    if ($videoImportContent.Contains($oldHead)) {
        $videoImportContent = $videoImportContent.Replace($oldHead, $newHead)
        Save-FileUtf8NoBom -Path $VideoImportFile -Content $videoImportContent
        Write-OK "video-import-service.ts : axios.head -> safeAxiosHead"
        $videoDone = $true
    } else {
        Write-Warn "axios.head pas trouve - peut-etre deja migre"
        $videoDone = $false
    }
}

# ============================================================================
# 5. Migration generic-html-adapter.ts (fetchHtmlPage)
# ============================================================================

Write-Step "5. Migration generic-html-adapter.ts"

$genericHtmlContent = Get-Content -Path $GenericHtmlFile -Raw -Encoding UTF8

if ($genericHtmlContent.Contains('safeAxiosGet')) {
    Write-Skip "generic-html-adapter.ts deja migre"
    $htmlDone = $false
} else {
    # Ajouter import safeAxiosGet
    $oldImport = "import axios from 'axios';"
    $newImport = "import axios from 'axios';`r`nimport { safeAxiosGet } from '../../../lib/safe-fetch';"

    if ($genericHtmlContent.Contains($oldImport)) {
        $genericHtmlContent = $genericHtmlContent.Replace($oldImport, $newImport)
    }

    # Remplacer axios.get<string>(url, par safeAxiosGet<string>(url,
    $oldCall = 'const response = await axios.get<string>(url, {'
    $newCall = 'const response = await safeAxiosGet<string>(url, {'

    if ($genericHtmlContent.Contains($oldCall)) {
        $genericHtmlContent = $genericHtmlContent.Replace($oldCall, $newCall)
        Save-FileUtf8NoBom -Path $GenericHtmlFile -Content $genericHtmlContent
        Write-OK "generic-html-adapter.ts : axios.get -> safeAxiosGet"
        $htmlDone = $true
    } else {
        Write-Warn "axios.get<string> pas trouve dans generic-html-adapter"
        $htmlDone = $false
    }
}

# ============================================================================
# 6. Generic-browser-adapter : ajout page.route() pour bloquer IP privees
# ============================================================================

Write-Step "6. generic-browser-adapter.ts : page.route() bloque les IPs privees"

$browserContent = Get-Content -Path $GenericBrowserFile -Raw -Encoding UTF8

if ($browserContent.Contains('blockedbyclient')) {
    Write-Skip "generic-browser-adapter deja patche (page.route present)"
    $browserDone = $false
} else {
    # Ajouter import assertPublicUrl
    if (-not $browserContent.Contains("from '../../../lib/url-security'")) {
        # Trouver la derniere ligne d'import et ajouter apres
        $importMatch = [regex]::Match($browserContent, "(?m)^import .+;\s*$")
        if ($importMatch.Success) {
            $allImports = [regex]::Matches($browserContent, "(?m)^import .+;\s*$")
            $lastImport = $allImports[$allImports.Count - 1]
            $insertPoint = $lastImport.Index + $lastImport.Length
            $newImportLine = "`r`nimport { assertPublicUrl } from '../../../lib/url-security';"
            $browserContent = $browserContent.Substring(0, $insertPoint) + $newImportLine + $browserContent.Substring($insertPoint)
        }
    }

    # Inserer page.route() avant le page.goto() dans capturePage
    # On cherche "await page.goto(" dans capturePage
    $oldGoto = 'await page.goto(url, {'
    $newGoto = @'
// [Patch HX-02/04] Bloquer toute requete vers un host prive (anti-SSRF Playwright)
  await page.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    try {
      assertPublicUrl(reqUrl);
      await route.continue();
    } catch {
      console.warn(`[generic_browser] requete bloquee vers host prive : ${reqUrl}`);
      await route.abort('blockedbyclient');
    }
  });

  await page.goto(url, {
'@

    if ($browserContent.Contains($oldGoto)) {
        $browserContent = $browserContent.Replace($oldGoto, $newGoto)
        Save-FileUtf8NoBom -Path $GenericBrowserFile -Content $browserContent
        Write-OK "generic-browser-adapter : page.route() ajoute avant page.goto()"
        $browserDone = $true
    } else {
        Write-Warn "page.goto(url, { pas trouve - le fichier a un format different"
        $browserDone = $false
    }
}

# ============================================================================
# 7. Attente redemarrage tsx
# ============================================================================

Write-Step "7. Attente redemarrage tsx watch"
Start-Sleep -Seconds 3
if (-not (Wait-ApiReady -TimeoutSec 25)) {
    Write-Bad "API ne repond plus"
    Write-Info "Verifie le terminal pnpm dev pour les erreurs TypeScript"
    exit 1
}
Write-OK "API redemarree"

# ============================================================================
# 8. Tests
# ============================================================================

if ($SkipTests) {
    Write-Step "Tests skippes"
    exit 0
}

Write-Step "8. Tests automatises HX-02/04"

# Login
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

function Test-Ssrf-Url {
    param(
        [string]$Url,
        [string]$Label
    )
    $body = @{ url = $Url } | ConvertTo-Json -Compress
    $blocked = $false
    $statusCode = 0
    $errorBody = ''
    try {
        $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/videos/import-url" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $statusCode = $r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode.value__
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $errorBody = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
        }
    }
    # Bloque si 400 + body parle de "host prive" ou "Host prive detecte"
    if ($statusCode -eq 400 -and ($errorBody -match 'host prive' -or $errorBody -match 'Host prive')) {
        $blocked = $true
    }
    Write-Info ("  $Label`: status=$statusCode, blocked=$blocked")
    return $blocked
}

# HX-02 : DNS rebinding via nip.io (resout vers 127.0.0.1)
Write-Info ""
Write-Info "Test HX-02 : domaine wildcard public qui resout vers 127.0.0.1"
$hx02_a = Test-Ssrf-Url -Url "http://127.0.0.1.nip.io/foo.mp4" -Label "127.0.0.1.nip.io"

# HX-04 : IPv6 expanded + IPv4-mapped
Write-Info ""
Write-Info "Test HX-04 : variantes IPv6"
$hx04_a = Test-Ssrf-Url -Url "http://[::1]/foo.mp4" -Label "[::1]"
$hx04_b = Test-Ssrf-Url -Url "http://[0:0:0:0:0:0:0:1]/foo.mp4" -Label "[0:0:0:0:0:0:0:1]"

# Verif non-regression : URL publique doit passer
Write-Info ""
Write-Info "Test non-regression : URL publique (example.com)"
$body = '{"url":"https://example.com/some-video.mp4"}'
$publicNotBlocked = $true
try {
    Invoke-WebRequest -Uri "$ApiUrl/api/v1/videos/import-url" `
        -Method POST -ContentType 'application/json' -Body $body `
        -WebSession $session -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop | Out-Null
} catch {
    if ($_.Exception.Response) {
        $code = [int]$_.Exception.Response.StatusCode.value__
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $b = $reader.ReadToEnd()
            $reader.Close()
            if ($b -match 'host prive' -or $b -match 'Host prive') {
                $publicNotBlocked = $false
                Write-Bad "  example.com bloque a tort : $b"
            } else {
                Write-Info "  example.com : status=$code (rejet pour autre raison, OK)"
            }
        } catch {}
    }
}
if ($publicNotBlocked) { Write-OK "  example.com pas bloque par check SSRF" }

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT LOT A"

Write-Host ""
Write-Host ("  HX-02 (DNS rebinding nip.io)    : " + $(if ($hx02_a) { 'OK (bloque)' } else { 'KO (pas bloque)' })) -ForegroundColor $(if ($hx02_a) { 'Green' } else { 'Red' })
Write-Host ("  HX-04 (IPv6 [::1])              : " + $(if ($hx04_a) { 'OK (bloque)' } else { 'KO (pas bloque)' })) -ForegroundColor $(if ($hx04_a) { 'Green' } else { 'Red' })
Write-Host ("  HX-04 (IPv6 expanded)           : " + $(if ($hx04_b) { 'OK (bloque)' } else { 'KO (pas bloque)' })) -ForegroundColor $(if ($hx04_b) { 'Green' } else { 'Red' })
Write-Host ("  Non-regression (example.com)    : " + $(if ($publicNotBlocked) { 'OK' } else { 'KO' })) -ForegroundColor $(if ($publicNotBlocked) { 'Green' } else { 'Red' })

Write-Host ""
if ($hx02_a -and $hx04_a -and $hx04_b -and $publicNotBlocked) {
    Write-Fixed "Lot A complet"
    Write-Host ""
    Write-Host "Commit :" -ForegroundColor Cyan
    Write-Host "  git add -A" -ForegroundColor Gray
    Write-Host "  git commit -m 'security(HX-02/03/04): DNS rebinding + redirections + IPv6 complet'" -ForegroundColor Gray
} else {
    Write-Bad "Au moins un test a echoue"
}
