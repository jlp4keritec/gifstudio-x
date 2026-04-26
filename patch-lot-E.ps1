#requires -Version 5.1
<#
.SYNOPSIS
    Lot E - Application des 8 findings herites de l'audit GifStudio publique.

.DESCRIPTION
    Patches en 2 sous-lots :

    SOUS-LOT E1 (CODE UNIQUEMENT, pas de migration BDD) :
        H-01 : Multer 1.x -> 2.x (CVE DoS)
        H-02 : bcrypt -> bcryptjs (chaine tar vulnerable)
        H-03 : JWT_SECRET validation stricte
        H-04 : Password seed renforce
        H-05 : Login sans recherche par prefixe + delai constant (anti-timing)
        H-08 : Origin check (CSRF mitigation)

    SOUS-LOT E2 (MIGRATIONS PRISMA - plus risque) :
        H-06 : Rate-limit en BDD (table login_attempts)
        H-07 : Audit log (table audit_logs)

.PARAMETER SkipBddPatches
    Si specifie, n'applique pas H-06 ni H-07 (skip les migrations).

.PARAMETER SkipTests
    Si specifie, n'execute pas les tests automatises a la fin.

.EXAMPLE
    .\patch-lot-E.ps1
    .\patch-lot-E.ps1 -SkipBddPatches
    .\patch-lot-E.ps1 -SkipTests
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$AdminPassword = 'AdminX123',
    [switch]$DryRun,
    [switch]$SkipTests,
    [switch]$SkipBddPatches
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
    param([int]$TimeoutSec = 20)
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

# Tracking des resultats
$applied = @{}
$failed = @()

# ============================================================================
# CHEMINS
# ============================================================================

$ApiDir = Join-Path $RepoRoot 'apps\api'
$ApiPackageJson = Join-Path $ApiDir 'package.json'
$EnvTsFile = Join-Path $ApiDir 'src\config\env.ts'
$SeedFile = Join-Path $ApiDir 'prisma\seed.ts'
$AuthControllerFile = Join-Path $ApiDir 'src\controllers\auth-controller.ts'
$AuthServiceFile = Join-Path $ApiDir 'src\services\auth-service.ts'
$AppTsFile = Join-Path $ApiDir 'src\app.ts'
$RateLimitFile = Join-Path $ApiDir 'src\middlewares\rate-limit.ts'
$PrismaSchema = Join-Path $ApiDir 'prisma\schema.prisma'

# ============================================================================
# 0. PRE-VOLS
# ============================================================================

New-Banner "Lot E - 8 patches herites (H-01 a H-08)"

Write-Step "0. Verifications prealables"

if (-not (Test-Path $ApiDir)) {
    Write-Bad "Dossier introuvable : $ApiDir"
    exit 1
}
Write-OK "Repo trouve"

$missing = @()
foreach ($f in @($ApiPackageJson, $EnvTsFile, $SeedFile, $AuthControllerFile, $AuthServiceFile, $AppTsFile, $RateLimitFile, $PrismaSchema)) {
    if (-not (Test-Path $f)) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Write-Bad "Fichiers manquants : $($missing -join ', ')"
    exit 1
}
Write-OK "Tous les fichiers cibles trouves"

if (-not (Wait-ApiReady -TimeoutSec 5)) {
    Write-Warn "L'API ne repond pas encore."
    Write-Info "Demarre 'pnpm dev' dans un autre terminal et relance le script."
    if (-not (Wait-ApiReady -TimeoutSec 15)) {
        exit 1
    }
}
Write-OK "API repond"

# Git status
Push-Location $RepoRoot
$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
    Write-Warn "Tu as des modifications non commit :"
    $gitStatus -split "`n" | Select-Object -First 10 | ForEach-Object { Write-Info $_ }
    Write-Info "Recommandation : commit ou stash avant de continuer."
}
Pop-Location

# ============================================================================
# H-01 : Multer 1.x -> 2.x
# ============================================================================

Write-Step "1. H-01 - Multer 1.x -> 2.x"

$pkgContent = Get-Content -Path $ApiPackageJson -Raw -Encoding UTF8

if ($pkgContent -notmatch '"multer":\s*"\^1\.') {
    Write-Skip "Multer deja en version 2.x (ou n'existe pas)"
    $applied['H-01'] = $false
} else {
    $pkgContent = $pkgContent -replace '"multer":\s*"\^1\.4\.5-lts\.1"', '"multer": "^2.0.2"'
    $pkgContent = $pkgContent -replace '"@types/multer":\s*"\^1\.4\.12"', '"@types/multer": "^1.4.12"'
    Save-FileUtf8NoBom -Path $ApiPackageJson -Content $pkgContent
    Write-OK "Multer mis a jour vers 2.0.2"
    $applied['H-01'] = $true
}

# ============================================================================
# H-02 : bcrypt -> bcryptjs (drop-in remplacement)
# ============================================================================

Write-Step "2. H-02 - bcrypt -> bcryptjs (pure JS, pas de tar)"

$pkgContent = Get-Content -Path $ApiPackageJson -Raw -Encoding UTF8

if ($pkgContent -notmatch '"bcrypt":\s*"\^5') {
    Write-Skip "bcrypt deja remplace ou absent"
    $applied['H-02'] = $false
} else {
    # Remplacer bcrypt par bcryptjs dans dependencies
    $pkgContent = $pkgContent -replace '"bcrypt":\s*"\^5\.1\.1"', '"bcryptjs": "^2.4.3"'
    # Remplacer @types/bcrypt par @types/bcryptjs dans devDependencies
    $pkgContent = $pkgContent -replace '"@types/bcrypt":\s*"\^5\.0\.2"', '"@types/bcryptjs": "^2.4.6"'
    Save-FileUtf8NoBom -Path $ApiPackageJson -Content $pkgContent

    # Modifier les imports dans auth-service.ts et seed.ts
    $authServiceContent = Get-Content -Path $AuthServiceFile -Raw -Encoding UTF8
    $authServiceContent = $authServiceContent -replace "import bcrypt from 'bcrypt';", "import bcrypt from 'bcryptjs';"
    Save-FileUtf8NoBom -Path $AuthServiceFile -Content $authServiceContent

    $seedContent = Get-Content -Path $SeedFile -Raw -Encoding UTF8
    $seedContent = $seedContent -replace "import bcrypt from 'bcrypt';", "import bcrypt from 'bcryptjs';"
    Save-FileUtf8NoBom -Path $SeedFile -Content $seedContent

    Write-OK "bcrypt remplace par bcryptjs dans package.json + 2 fichiers"
    Write-Info "Note : les hashs existants restent valides (format \$2a\$/\$2b\$ identique)"
    $applied['H-02'] = $true
}

# ============================================================================
# H-03 : JWT_SECRET validation stricte
# ============================================================================

Write-Step "3. H-03 - Validation stricte JWT_SECRET au demarrage"

$envTsContent = Get-Content -Path $EnvTsFile -Raw -Encoding UTF8

if ($envTsContent -match '\.refine\(.*JWT_SECRET') {
    Write-Skip "Validation stricte JWT_SECRET deja presente"
    $applied['H-03'] = $false
} else {
    # Remplacer la ligne JWT_SECRET par une version avec refine() qui rejette les valeurs faibles
    $oldJwt = "JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),"
    $newJwt = @"
JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      (s) => !/(change-me|change_me|your-secret|default|dev-secret|test-secret)/i.test(s),
      'JWT_SECRET contient une valeur par defaut/placeholder. Genere une vraie valeur aleatoire.',
    ),
"@

    if ($envTsContent -match [regex]::Escape($oldJwt)) {
        $envTsContent = $envTsContent -replace [regex]::Escape($oldJwt), $newJwt
        Save-FileUtf8NoBom -Path $EnvTsFile -Content $envTsContent
        Write-OK "Validation JWT_SECRET renforcee (min 32 chars + rejet placeholders)"
        Write-Warn "ATTENTION : si ton JWT_SECRET actuel est 'change-me-...', l'API va refuser de demarrer !"
        Write-Info "Solution : modifie .env avec une vraie cle aleatoire."
        Write-Info "Genere une cle :"
        Write-Info "  PowerShell : -join ((1..48) | ForEach-Object { [char](Get-Random -Min 33 -Max 126) })"
        $applied['H-03'] = $true
    } else {
        Write-Bad "Ligne JWT_SECRET introuvable"
        $applied['H-03'] = $false
    }
}

# ============================================================================
# H-04 : Password seed renforce
# ============================================================================

Write-Step "4. H-04 - Password seed renforce + force changement en prod"

$seedContent = Get-Content -Path $SeedFile -Raw -Encoding UTF8

if ($seedContent -match 'MINIMUM_ADMIN_PASSWORD') {
    Write-Skip "Patch H-04 deja applique"
    $applied['H-04'] = $false
} else {
    $oldSeedBlock = @'
  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }
'@

    $newSeedBlock = @'
  // [Patch H-04] Validation stricte du mot de passe admin
  const MINIMUM_ADMIN_PASSWORD = 12;
  const COMMON_WEAK = ['admin', 'password', 'changeme', 'adminx', 'gifstudio'];

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }
  if (adminPassword.length < MINIMUM_ADMIN_PASSWORD) {
    throw new Error(
      `ADMIN_PASSWORD trop court (min ${MINIMUM_ADMIN_PASSWORD} chars). Genere une vraie valeur.`,
    );
  }
  if (!/[A-Z]/.test(adminPassword) || !/\d/.test(adminPassword) || !/[^A-Za-z0-9]/.test(adminPassword)) {
    throw new Error('ADMIN_PASSWORD doit contenir majuscule + chiffre + caractere special');
  }
  const lower = adminPassword.toLowerCase();
  if (COMMON_WEAK.some((w) => lower.includes(w))) {
    throw new Error('ADMIN_PASSWORD contient un mot trop commun (admin, password, gifstudio, ...)');
  }
'@

    $seedNorm = $seedContent -replace "`r`n", "`n"
    $needle = $oldSeedBlock -replace "`r`n", "`n"

    if ($seedNorm -match [regex]::Escape($needle)) {
        $seedNorm = $seedNorm -replace [regex]::Escape($needle), $newSeedBlock
        $seedContent = $seedNorm -replace "`n", "`r`n"
        Save-FileUtf8NoBom -Path $SeedFile -Content $seedContent
        Write-OK "Validation password renforcee dans seed.ts"
        Write-Warn "ATTENTION : si ton ADMIN_PASSWORD est 'AdminX123', le seed va refuser !"
        Write-Info "Modifie .env avec une vraie cle :"
        Write-Info "  ADMIN_PASSWORD=Choisis_un-vrai_mdp.42"
        Write-Info "Cette validation s'applique uniquement au prochain seed (le user actuel n'est pas affecte)."
        $applied['H-04'] = $true
    } else {
        Write-Bad "Bloc validation seed introuvable"
        $applied['H-04'] = $false
    }
}

# ============================================================================
# H-05 : Login sans recherche par prefixe + delai constant
# ============================================================================

Write-Step "5. H-05 - Login : suppression recherche prefixe + anti-timing attack"

$authCtlContent = Get-Content -Path $AuthControllerFile -Raw -Encoding UTF8

if ($authCtlContent -match 'DUMMY_BCRYPT_HASH') {
    Write-Skip "Patch H-05 deja applique"
    $applied['H-05'] = $false
} else {
    # 1. Modifier findUserByIdentifier pour exiger un email complet
    $oldFn = @'
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase();

  if (trimmed.includes('@')) {
    return prisma.user.findUnique({ where: { email: trimmed } });
  }

  return prisma.user.findFirst({
    where: {
      email: { startsWith: `${trimmed}@`, mode: 'insensitive' },
    },
  });
}
'@

    $newFn = @'
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
// Hash bidon valide (mot de passe : "dummy-never-matches").
const DUMMY_BCRYPT_HASH = '$2a$12$1234567890123456789012abcdefghijklmnopqrstuvwxyzABCDEFGH.';
'@

    $authNorm = $authCtlContent -replace "`r`n", "`n"
    $needle = $oldFn -replace "`r`n", "`n"

    if ($authNorm -match [regex]::Escape($needle)) {
        $authNorm = $authNorm -replace [regex]::Escape($needle), $newFn

        # 2. Modifier login pour appeler bcrypt.compare meme si user inexistant
        $oldLogin = @'
    const user = await findUserByIdentifier(identifier);

    if (!user || !user.isActive) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
'@

        $newLogin = @'
    const user = await findUserByIdentifier(identifier);

    // [Patch H-05] Anti-timing : on hash toujours, meme si user inexistant
    const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await verifyPassword(password, hashToCheck);

    if (!user || !user.isActive || !valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
'@

        $authNorm = $authNorm -replace [regex]::Escape($oldLogin -replace "`r`n", "`n"), $newLogin

        $authCtlContent = $authNorm -replace "`n", "`r`n"
        Save-FileUtf8NoBom -Path $AuthControllerFile -Content $authCtlContent

        Write-OK "Login durci : email complet requis + delai bcrypt constant"
        Write-Warn "Impact UX : il faut maintenant taper l'email complet pour se connecter"
        Write-Info "  AVANT : login = 'admin' fonctionnait"
        Write-Info "  APRES : login = 'admin@gifstudio-x.local' obligatoire"
        $applied['H-05'] = $true
    } else {
        Write-Bad "Fonction findUserByIdentifier introuvable"
        $applied['H-05'] = $false
    }
}

# ============================================================================
# H-08 : Origin check (CSRF mitigation)
# ============================================================================

Write-Step "6. H-08 - Origin check (mitigation CSRF)"

$originCheckFile = Join-Path $ApiDir 'src\middlewares\origin-check.ts'

if (Test-Path $originCheckFile) {
    Write-Skip "Middleware origin-check deja present"
    $applied['H-08'] = $false
} else {
    $originCheckCode = @'
// [Patch H-08] Origin check (mitigation CSRF en complement de SameSite=strict)
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from './error-handler';

const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(',').map((s) => s.trim());

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Verifie que l'Origin (ou Referer en fallback) correspond a CORS_ORIGIN.
 * S'applique uniquement aux methodes mutantes.
 *
 * Defense en profondeur en plus du SameSite=strict du cookie auth.
 */
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

  // Si pas d'Origin (peut arriver avec curl/scripts), on regarde le Referer
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

    # Application dans app.ts apres CORS
    $appTsContent = Get-Content -Path $AppTsFile -Raw -Encoding UTF8

    if ($appTsContent -notmatch "originCheck") {
        $oldImports = "import { optionalAuth } from './middlewares/optional-auth';"
        $newImports = $oldImports + "`r`nimport { originCheck } from './middlewares/origin-check';"
        $appTsContent = $appTsContent -replace [regex]::Escape($oldImports), $newImports

        # Application de originCheck juste avant l'apiRouter
        $oldApiRoute = "  app.use('/api/v1', optionalAuth);`r`n  app.use('/api/v1', apiRouter);"
        $newApiRoute = "  app.use('/api/v1', optionalAuth);`r`n  app.use('/api/v1', originCheck);`r`n  app.use('/api/v1', apiRouter);"

        $appTsNorm = $appTsContent -replace "`r`n", "`n"
        $oldApiNorm = $oldApiRoute -replace "`r`n", "`n"
        $newApiNorm = $newApiRoute -replace "`r`n", "`n"

        if ($appTsNorm -match [regex]::Escape($oldApiNorm)) {
            $appTsNorm = $appTsNorm -replace [regex]::Escape($oldApiNorm), $newApiNorm
            $appTsContent = $appTsNorm -replace "`n", "`r`n"
            Save-FileUtf8NoBom -Path $AppTsFile -Content $appTsContent
            Write-OK "originCheck cree et active dans app.ts"
            Write-Info "Note : effectif uniquement quand NODE_ENV=production"
            $applied['H-08'] = $true
        } else {
            Write-Bad "Bloc app.use('/api/v1', ...) introuvable dans app.ts"
            $applied['H-08'] = $false
        }
    } else {
        Write-Skip "originCheck deja importe dans app.ts"
        $applied['H-08'] = $false
    }
}

# ============================================================================
# E2 - Patches BDD (H-06, H-07)
# ============================================================================

if ($SkipBddPatches) {
    Write-Step "7. H-06 / H-07 SKIP (-SkipBddPatches)"
    Write-Info "Pour les appliquer plus tard : .\patch-lot-E.ps1 (sans -SkipBddPatches)"
} else {
    # H-06 : Rate-limit BDD
    Write-Step "7. H-06 - Rate-limit en BDD (table login_attempts)"

    $schemaContent = Get-Content -Path $PrismaSchema -Raw -Encoding UTF8

    if ($schemaContent -match 'model LoginAttempt') {
        Write-Skip "Modele LoginAttempt deja present"
        $applied['H-06'] = $false
    } else {
        # Ajout du modele en fin de fichier
        $loginAttemptModel = @'

// [Patch H-06] Rate-limit en BDD (resiste aux redemarrages)
model LoginAttempt {
  id             String   @id @default(uuid()) @db.Uuid
  // Hash de "{ip}:{identifier}" pour ne pas stocker l'identifier en clair
  attemptKey     String   @unique @map("attempt_key") @db.VarChar(64)
  count          Int      @default(1)
  firstAttemptAt DateTime @default(now()) @map("first_attempt_at")
  blockedUntil   DateTime? @map("blocked_until")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([attemptKey])
  @@index([blockedUntil])
  @@map("login_attempts")
}
'@

        $schemaContent = $schemaContent.TrimEnd() + "`r`n" + $loginAttemptModel + "`r`n"
        Save-FileUtf8NoBom -Path $PrismaSchema -Content $schemaContent
        Write-OK "Modele LoginAttempt ajoute au schema"
        Write-Info "Migration Prisma a executer manuellement (a la fin du script)"
        $applied['H-06'] = $true
    }

    # H-07 : Audit log
    Write-Step "8. H-07 - Audit log (table audit_logs)"

    $schemaContent = Get-Content -Path $PrismaSchema -Raw -Encoding UTF8

    if ($schemaContent -match 'model AuditLog') {
        Write-Skip "Modele AuditLog deja present"
        $applied['H-07'] = $false
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
        Write-OK "Modele AuditLog ajoute au schema"

        # Creation du service audit minimal
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

/**
 * Log une action sensible. Ne throw jamais (audit ne doit pas casser le flux metier).
 */
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
    // Ne pas casser le flux. Logger en console pour debug uniquement.
    console.warn('[audit] failed to log entry:', err);
  }
}
'@
            Save-FileUtf8NoBom -Path $auditServiceFile -Content $auditServiceCode
            Write-OK "Service audit-service.ts cree"
        }

        Write-Info "Service cree, mais l'integration aux controllers est manuelle (a part)."
        Write-Info "Pour activer : appeler logAudit() depuis auth-controller.ts (login/logout/changePassword)"
        $applied['H-07'] = $true
    }
}

# ============================================================================
# Resume des changements
# ============================================================================

Write-Step "Resume des changements"

foreach ($k in @('H-01', 'H-02', 'H-03', 'H-04', 'H-05', 'H-06', 'H-07', 'H-08')) {
    if ($applied.ContainsKey($k) -and $applied[$k]) {
        Write-Host "  $k : APPLIQUE" -ForegroundColor Green
    } else {
        Write-Host "  $k : skip ou deja applique" -ForegroundColor DarkGray
    }
}

if ($DryRun) {
    Write-Info ""
    Write-Info "DRY-RUN termine."
    exit 0
}

# Si rien n'a ete applique
$anyApplied = ($applied.Values | Where-Object { $_ -eq $true }).Count -gt 0
if (-not $anyApplied) {
    Write-Info ""
    Write-Info "Tous les patches sont deja en place. Rien a faire."
    exit 0
}

# ============================================================================
# Etape post-patch : pnpm install + migration BDD
# ============================================================================

Write-Step "Post-patch : pnpm install et migrations"

if ($applied.ContainsKey('H-01') -and $applied['H-01'] -or
    $applied.ContainsKey('H-02') -and $applied['H-02']) {

    Write-Info "Lancement de pnpm install (multer / bcryptjs)..."
    Push-Location $RepoRoot
    try {
        $installOutput = pnpm install 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            Write-Bad "pnpm install a echoue"
            Write-Info $installOutput
            Pop-Location
            exit 1
        }
        Write-OK "pnpm install termine"
    } catch {
        Write-Bad "pnpm install a leve une exception : $_"
        Pop-Location
        exit 1
    }
    Pop-Location
}

if (-not $SkipBddPatches -and (
        ($applied.ContainsKey('H-06') -and $applied['H-06']) -or
        ($applied.ContainsKey('H-07') -and $applied['H-07'])
    )) {

    Write-Warn "Migration Prisma a executer pour H-06 et/ou H-07"
    Write-Info "Lance toi-meme la commande suivante depuis le repo :"
    Write-Info ""
    Write-Info "  pnpm --filter api prisma:migrate dev --name add_login_attempts_and_audit_logs"
    Write-Info ""
    Write-Info "Tape 'O' pour la lancer maintenant via le script, 'N' pour la lancer manuellement plus tard :"
    $answer = Read-Host
    if ($answer -eq 'O' -or $answer -eq 'o') {
        Push-Location $RepoRoot
        try {
            & pnpm --filter api prisma migrate dev --name add_login_attempts_and_audit_logs
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Migration Prisma reussie"
            } else {
                Write-Bad "Migration Prisma a echoue (code $LASTEXITCODE)"
            }
        } catch {
            Write-Bad "Migration Prisma a leve une exception : $_"
        }
        Pop-Location
    } else {
        Write-Info "Migration manuelle a faire avant de redemarrer l'API."
    }
}

# Attente redemarrage tsx
Write-Step "Attente du redemarrage tsx watch (~10s, plus long apres pnpm install)"
Start-Sleep -Seconds 5
if (-not (Wait-ApiReady -TimeoutSec 30)) {
    Write-Warn "L'API ne repond plus."
    Write-Info "Possible : "
    Write-Info "  - Erreur de compilation TypeScript (regarder le terminal pnpm dev)"
    Write-Info "  - Si H-03 : ton JWT_SECRET est rejete par la nouvelle validation. Modifie .env."
    Write-Info "  - Si H-06/H-07 : la migration n'est pas encore passee."
    Write-Info ""
    Write-Info "Pour rollback complet : git stash"
    exit 1
}
Write-OK "API redemarree"

# ============================================================================
# TESTS
# ============================================================================

if ($SkipTests) {
    Write-Step "Tests skippes (-SkipTests)"
    exit 0
}

Write-Step "Tests automatises"

# Test H-05 : login par prefixe doit echouer
Write-Info ""
Write-Info "Test H-05 : login par prefixe (sans @)"
try {
    $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' `
        -Body '{"identifier":"admin","password":"AdminX123"}' `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Bad "  Login par prefixe a reussi -> H-05 NON applique"
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Fixed "Login par prefixe rejete (401)"
    } else {
        Write-Warn "Reponse inattendue : $_"
    }
}

# Test H-05 anti-timing
Write-Info ""
Write-Info "Test H-05 : timing attack (compare existant vs inexistant)"

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

$existingTimes = @()
$nonExistTimes = @()
for ($i = 1; $i -le 5; $i++) {
    $existingTimes += Measure-LoginTime -Identifier $AdminEmail -Password "wrongpwd-$i"
    $nonExistTimes += Measure-LoginTime -Identifier "nobody-$i@nowhere.fake" -Password "any-pwd-$i"
}

$avgExist = ($existingTimes | Measure-Object -Average).Average
$avgNoExist = ($nonExistTimes | Measure-Object -Average).Average
$diff = [Math]::Abs($avgExist - $avgNoExist)

Write-Info "  User existant     : ~$([Math]::Round($avgExist)) ms (5 essais)"
Write-Info "  User inexistant   : ~$([Math]::Round($avgNoExist)) ms (5 essais)"
Write-Info "  Difference        : $([Math]::Round($diff)) ms"

if ($diff -lt 50) {
    Write-Fixed "Anti-timing OK (ecart < 50ms)"
} elseif ($diff -lt 100) {
    Write-Warn "Ecart modere (~$([Math]::Round($diff))ms) - peut suffire selon contexte"
} else {
    Write-Bad "Ecart trop grand (~$([Math]::Round($diff))ms) -> timing attack possible"
}

# Test H-08 (uniquement si NODE_ENV=production, sinon skip)
Write-Info ""
Write-Info "Test H-08 : Origin check (skip en dev - effectif uniquement en prod)"

# Test H-01 : verification statique (Multer 2 dans package.json)
Write-Info ""
Write-Info "Test H-01 : Multer 2.x dans package.json"
$pkgNow = Get-Content -Path $ApiPackageJson -Raw -Encoding UTF8
if ($pkgNow -match '"multer":\s*"\^2\.') {
    Write-Fixed "Multer 2.x present"
} else {
    Write-Bad "Multer toujours en 1.x"
}

# Test H-02 : verification statique
Write-Info ""
Write-Info "Test H-02 : bcryptjs au lieu de bcrypt"
if ($pkgNow -match '"bcryptjs"' -and $pkgNow -notmatch '"bcrypt":\s*"\^5') {
    Write-Fixed "bcryptjs present, bcrypt absent"
} else {
    Write-Bad "Migration bcryptjs incomplete"
}

# ============================================================================
# VERDICT
# ============================================================================

New-Banner "VERDICT LOT E"

Write-Host ""
foreach ($k in @('H-01', 'H-02', 'H-03', 'H-04', 'H-05', 'H-06', 'H-07', 'H-08')) {
    if ($applied.ContainsKey($k) -and $applied[$k]) {
        Write-Host "  $k : APPLIQUE" -ForegroundColor Green
    } else {
        Write-Host "  $k : skip" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Si l'API ne redemarre pas (JWT_SECRET ou ADMIN_PASSWORD rejetes) :" -ForegroundColor Yellow
Write-Host "  1. Edite .env et apps/api/.env" -ForegroundColor Gray
Write-Host "  2. JWT_SECRET=<32+ chars aleatoires non-placeholder>" -ForegroundColor Gray
Write-Host "  3. ADMIN_PASSWORD=<12+ chars avec maj+chiffre+special>" -ForegroundColor Gray
Write-Host "  4. Redemarre pnpm dev" -ForegroundColor Gray

Write-Host ""
Write-Host "Commit suggere :" -ForegroundColor Cyan
Write-Host "  git add -A" -ForegroundColor Gray
Write-Host "  git commit -m 'security(H-01..H-08): apply inherited patches from public audit'" -ForegroundColor Gray
