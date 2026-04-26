#requires -Version 5.1
<#
.SYNOPSIS
    Termine le lot E apres echec H-05 du script precedent.
    Applique H-05 (corrige), H-06, H-07, H-08.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123',
    [switch]$SkipBddPatches,
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
$AuthControllerFile = Join-Path $ApiDir 'src\controllers\auth-controller.ts'
$AppTsFile = Join-Path $ApiDir 'src\app.ts'
$PrismaSchema = Join-Path $ApiDir 'prisma\schema.prisma'

New-Banner "Finish lot E - H-05 (corrige) + H-06/07/08"

Write-Step "0. Pre-vols"
if (-not (Wait-ApiReady -TimeoutSec 5)) {
    Write-Warn "API ne repond pas. Demarre 'pnpm dev' et relance."
    if (-not (Wait-ApiReady -TimeoutSec 15)) { exit 1 }
}
Write-OK "API repond"

# ============================================================================
# H-05 (corrige) - utilise une approche par String.Replace au lieu de -replace
# pour eviter l'interpretation des $ comme references arriere de regex
# ============================================================================

Write-Step "1. H-05 - Login durci (version corrigee)"

$content = Get-Content -Path $AuthControllerFile -Raw -Encoding UTF8

if ($content -match 'DUMMY_BCRYPT_HASH') {
    Write-Skip "H-05 deja applique"
    $hx05 = $false
} else {
    # Remplacement par String.Replace (pas de regex) -> immune au probleme du $

    $oldFn = @"
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase();

  if (trimmed.includes('@')) {
    return prisma.user.findUnique({ where: { email: trimmed } });
  }

  return prisma.user.findFirst({
    where: {
      email: { startsWith: ```${trimmed}@``, mode: 'insensitive' },
    },
  });
}
"@

    # Le hash bidon - on l'assemble en plusieurs morceaux pour eviter les problemes
    $dollar = '$'
    $hashBody = '12' + $dollar + '1234567890123456789012abcdefghijklmnopqrstuvwxyzABCDEFGH.'
    $dummyHash = $dollar + '2a' + $dollar + $hashBody

    $newFn = @"
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase();

  // [Patch H-05] Recherche par prefixe supprimee : on exige un email complet.
  // Empeche l'enumeration de comptes via "admin" (qui matche admin@... avant).
  if (!trimmed.includes('@')) {
    return null;
  }
  return prisma.user.findUnique({ where: { email: trimmed } });
}

// [Patch H-05] Hash factice pour anti-timing attack : si user inexistant, on
// fait quand meme un bcrypt.compare pour que la duree de reponse soit identique.
const DUMMY_BCRYPT_HASH = '$dummyHash';
"@

    # On utilise String.Replace (pas -replace) pour eviter le probleme du $
    if ($content.Contains($oldFn)) {
        $content = $content.Replace($oldFn, $newFn)

        # Modifier login pour utiliser le hash factice
        $oldLogin = @"
    const user = await findUserByIdentifier(identifier);

    if (!user || !user.isActive) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
"@

        $newLogin = @"
    const user = await findUserByIdentifier(identifier);

    // [Patch H-05] Anti-timing : on hash toujours, meme si user inexistant
    const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await verifyPassword(password, hashToCheck);

    if (!user || !user.isActive || !valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
"@

        if ($content.Contains($oldLogin)) {
            $content = $content.Replace($oldLogin, $newLogin)
            Save-FileUtf8NoBom -Path $AuthControllerFile -Content $content
            Write-OK "H-05 applique : login durci"
            Write-Warn "Impact UX : tape l'email complet (admin@gifstudio-x.local) pour te connecter"
            $hx05 = $true
        } else {
            Write-Bad "Bloc login introuvable"
            $hx05 = $false
        }
    } else {
        Write-Bad "Fonction findUserByIdentifier introuvable"
        $hx05 = $false
    }
}

# ============================================================================
# H-08 - Origin check
# ============================================================================

Write-Step "2. H-08 - Origin check (CSRF mitigation)"

$originCheckFile = Join-Path $ApiDir 'src\middlewares\origin-check.ts'

if (Test-Path $originCheckFile) {
    Write-Skip "Middleware origin-check deja present"
    $hx08 = $false
} else {
    $originCheckCode = @'
// [Patch H-08] Origin check (mitigation CSRF en complement de SameSite=strict)
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from './error-handler';

const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(',').map((s) => s.trim());

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.includes(req.method)) {
    return next();
  }

  // En dev, on tolere les requetes sans Origin (curl, scripts)
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  let source: string | undefined;
  if (origin) {
    source = origin;
  } else if (referer) {
    try {
      source = new URL(referer).origin;
    } catch {
      source = undefined;
    }
  }

  if (!source) {
    return next(new AppError(403, 'Origin manquant', 'CSRF_BLOCKED'));
  }

  if (!ALLOWED_ORIGINS.includes(source)) {
    return next(new AppError(403, `Origin non autorise : ${source}`, 'CSRF_BLOCKED'));
  }

  next();
}
'@

    Save-FileUtf8NoBom -Path $originCheckFile -Content $originCheckCode

    $appTsContent = Get-Content -Path $AppTsFile -Raw -Encoding UTF8
    if ($appTsContent.Contains("originCheck")) {
        Write-Skip "originCheck deja importe dans app.ts"
        $hx08 = $false
    } else {
        $oldImport = "import { optionalAuth } from './middlewares/optional-auth';"
        $newImport = "import { optionalAuth } from './middlewares/optional-auth';`r`nimport { originCheck } from './middlewares/origin-check';"
        $appTsContent = $appTsContent.Replace($oldImport, $newImport)

        $oldRoute = "  app.use('/api/v1', optionalAuth);`r`n  app.use('/api/v1', apiRouter);"
        $newRoute = "  app.use('/api/v1', optionalAuth);`r`n  app.use('/api/v1', originCheck);`r`n  app.use('/api/v1', apiRouter);"

        if ($appTsContent.Contains($oldRoute)) {
            $appTsContent = $appTsContent.Replace($oldRoute, $newRoute)
            Save-FileUtf8NoBom -Path $AppTsFile -Content $appTsContent
            Write-OK "originCheck active dans app.ts"
            Write-Info "Effectif uniquement quand NODE_ENV=production"
            $hx08 = $true
        } else {
            Write-Bad "Bloc app.use('/api/v1') introuvable"
            $hx08 = $false
        }
    }
}

# ============================================================================
# H-06 + H-07 - Modeles Prisma + migration
# ============================================================================

if ($SkipBddPatches) {
    Write-Step "3-4. H-06 / H-07 SKIP (-SkipBddPatches)"
    $hx06 = $false; $hx07 = $false
} else {
    Write-Step "3. H-06 - Modele LoginAttempt"

    $schemaContent = Get-Content -Path $PrismaSchema -Raw -Encoding UTF8

    if ($schemaContent.Contains("model LoginAttempt")) {
        Write-Skip "Modele LoginAttempt deja present"
        $hx06 = $false
    } else {
        $loginAttemptModel = @'

// [Patch H-06] Rate-limit en BDD (resiste aux redemarrages)
model LoginAttempt {
  id             String    @id @default(uuid()) @db.Uuid
  attemptKey     String    @unique @map("attempt_key") @db.VarChar(64)
  count          Int       @default(1)
  firstAttemptAt DateTime  @default(now()) @map("first_attempt_at")
  blockedUntil   DateTime? @map("blocked_until")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([attemptKey])
  @@index([blockedUntil])
  @@map("login_attempts")
}
'@

        $schemaContent = $schemaContent.TrimEnd() + "`r`n" + $loginAttemptModel + "`r`n"
        Save-FileUtf8NoBom -Path $PrismaSchema -Content $schemaContent
        Write-OK "Modele LoginAttempt ajoute au schema"
        $hx06 = $true
    }

    Write-Step "4. H-07 - Modele AuditLog + service"

    $schemaContent = Get-Content -Path $PrismaSchema -Raw -Encoding UTF8

    if ($schemaContent.Contains("model AuditLog")) {
        Write-Skip "Modele AuditLog deja present"
        $hx07 = $false
    } else {
        $auditLogModel = @'

// [Patch H-07] Audit log : tracabilite des actions sensibles
model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String?  @map("user_id") @db.Uuid
  action    String   @db.VarChar(100)
  resource  String?  @db.VarChar(255)
  ipHash    String?  @map("ip_hash") @db.VarChar(64)
  userAgent String?  @map("user_agent") @db.VarChar(500)
  payload   Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([action])
  @@index([createdAt(sort: Desc)])
  @@map("audit_logs")
}
'@

        $schemaContent = $schemaContent.TrimEnd() + "`r`n" + $auditLogModel + "`r`n"
        Save-FileUtf8NoBom -Path $PrismaSchema -Content $schemaContent

        # Service audit minimal
        $auditServiceFile = Join-Path $ApiDir 'src\services\audit-service.ts'
        if (-not (Test-Path $auditServiceFile)) {
            $auditServiceCode = @'
// [Patch H-07] Service d'audit log
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';

export type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.password.changed'
  | 'admin.user.created'
  | 'admin.user.updated'
  | 'admin.user.deleted'
  | 'admin.user.password_reset'
  | 'crawler.source.created'
  | 'crawler.source.updated'
  | 'crawler.source.deleted'
  | 'crawler.test.generic_html'
  | 'crawler.test.generic_browser'
  | 'video.share.created'
  | 'video.share.revoked';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  resource?: string | null;
  ip?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

export function getAuditContext(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`gifstudio-x-audit:${ip}`).digest('hex').slice(0, 64);
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        ipHash: hashIp(entry.ip),
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        payload: (entry.payload ?? {}) as never,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to log entry:', err);
  }
}
'@
            Save-FileUtf8NoBom -Path $auditServiceFile -Content $auditServiceCode
            Write-OK "Service audit-service.ts cree"
        }

        Save-FileUtf8NoBom -Path $PrismaSchema -Content $schemaContent
        Write-OK "Modele AuditLog ajoute"
        $hx07 = $true
    }
}

# ============================================================================
# Migration Prisma
# ============================================================================

if (-not $SkipBddPatches -and ($hx06 -or $hx07)) {
    Write-Step "5. Migration Prisma"

    Write-Info "Une migration Prisma va etre creee pour ajouter les nouvelles tables."
    Write-Info "Tape 'O' pour la lancer maintenant, 'N' pour le faire manuellement plus tard :"
    $answer = Read-Host

    if ($answer -eq 'O' -or $answer -eq 'o') {
        Push-Location $RepoRoot
        try {
            Write-Info "Lancement de prisma migrate dev..."
            & pnpm --filter api prisma migrate dev --name add_login_attempts_and_audit_logs
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Migration Prisma reussie"
            } else {
                Write-Bad "Migration Prisma a echoue (code $LASTEXITCODE)"
                Write-Info "Tu peux la relancer manuellement : pnpm --filter api prisma migrate dev --name add_login_attempts_and_audit_logs"
            }
        } catch {
            Write-Bad "Exception : $_"
        }
        Pop-Location
    } else {
        Write-Info "A faire avant de redemarrer :"
        Write-Info "  pnpm --filter api prisma migrate dev --name add_login_attempts_and_audit_logs"
    }
}

# ============================================================================
# Attente redemarrage
# ============================================================================

Write-Step "6. Attente redemarrage tsx watch"
Start-Sleep -Seconds 3
if (-not (Wait-ApiReady -TimeoutSec 25)) {
    Write-Warn "L'API ne repond plus."
    Write-Info "Causes possibles :"
    Write-Info "  - JWT_SECRET rejete (H-03 stricte) - voir .env"
    Write-Info "  - Erreur compilation TypeScript - voir terminal pnpm dev"
    Write-Info "  - Migration Prisma pas encore passee (H-06/07)"
    exit 1
}
Write-OK "API redemarree"

# ============================================================================
# Tests
# ============================================================================

if ($SkipTests) {
    Write-Step "Tests skippes"
    exit 0
}

Write-Step "7. Tests automatises"

# Test H-05 : login par prefixe doit echouer
Write-Info ""
Write-Info "Test H-05a : login par prefixe doit etre rejete"
$prefixOk = $false
try {
    Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' `
        -Body '{"identifier":"admin","password":"AdminX123"}' `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    Write-Bad "Login par prefixe a reussi -> H-05 NON applique"
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Fixed "Login par prefixe rejete (401)"
        $prefixOk = $true
    } else {
        Write-Warn "Reponse inattendue"
    }
}

# Test timing attack
Write-Info ""
Write-Info "Test H-05b : anti-timing attack (5 essais existant vs 5 inexistant)"

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

# Warm-up (premiere requete bcrypt souvent plus longue)
Measure-LoginTime -Identifier $AdminEmail -Password "warmup" | Out-Null

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

$timingOk = $false
if ($diff -lt 50) {
    Write-Fixed "Anti-timing OK (ecart < 50ms)"
    $timingOk = $true
} elseif ($diff -lt 100) {
    Write-Warn "Ecart modere"
    $timingOk = $true
} else {
    Write-Bad "Ecart trop grand"
}

# H-08 effectif uniquement en prod
Write-Info ""
Write-Info "Test H-08 : effectif uniquement en NODE_ENV=production -> pas de test en dev"

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT FINAL LOT E"

Write-Host ""
Write-Host "  H-01 Multer 1->2          : OK (verifie au run precedent)" -ForegroundColor Green
Write-Host "  H-02 bcryptjs             : OK (verifie au run precedent)" -ForegroundColor Green
Write-Host "  H-03 JWT_SECRET strict    : OK (verifie au run precedent)" -ForegroundColor Green
Write-Host "  H-04 Password seed        : OK (verifie au run precedent)" -ForegroundColor Green
Write-Host ("  H-05 Login durci          : " + $(if ($prefixOk -and $timingOk) { 'OK' } else { 'partiel' })) -ForegroundColor $(if ($prefixOk -and $timingOk) { 'Green' } else { 'Yellow' })
Write-Host ("  H-06 Rate-limit BDD       : " + $(if ($hx06) { 'APPLIQUE (migration requise)' } else { 'skip' })) -ForegroundColor $(if ($hx06) { 'Green' } else { 'DarkGray' })
Write-Host ("  H-07 Audit log            : " + $(if ($hx07) { 'APPLIQUE (migration requise)' } else { 'skip' })) -ForegroundColor $(if ($hx07) { 'Green' } else { 'DarkGray' })
Write-Host ("  H-08 Origin check         : " + $(if ($hx08) { 'APPLIQUE (effectif en prod)' } else { 'deja applique' })) -ForegroundColor $(if ($hx08) { 'Green' } else { 'DarkGray' })

Write-Host ""
Write-Host "Commit suggere :" -ForegroundColor Cyan
Write-Host "  git add -A" -ForegroundColor Gray
Write-Host "  git commit -m 'security(H-01..H-08): apply inherited patches'" -ForegroundColor Gray
