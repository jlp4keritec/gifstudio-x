#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ApiUrl = 'http://localhost:4003',
    [string]$AdminEmail = 'admin@gifstudio-x.local',
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Continue'

Write-Host "`n==> Test login (sanity check)" -ForegroundColor Cyan
$body = @{ identifier = $AdminEmail; password = 'AdminX123' } | ConvertTo-Json -Compress
try {
    $r = Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
        -Method POST -ContentType 'application/json' -Body $body `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "  Status: $($r.StatusCode) - Login OK" -ForegroundColor Green
} catch {
    if ($_.Exception.Response) {
        Write-Host "  Status: $([int]$_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor Red
            $reader.Close()
        } catch {}
        Write-Host "  -> L'API plante, fix-ultimate-lot-E.ps1 a un autre probleme" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n==> Test timing H-05 (5 essais existant + 5 inexistant)" -ForegroundColor Cyan

function Measure-LoginTime {
    param([string]$Identifier, [string]$Password)
    $b = @{ identifier = $Identifier; password = $Password } | ConvertTo-Json -Compress
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-WebRequest -Uri "$ApiUrl/api/v1/auth/login" `
            -Method POST -ContentType 'application/json' -Body $b `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    } catch { }
    $sw.Stop()
    return $sw.ElapsedMilliseconds
}

# Warm-up serieux
1..5 | ForEach-Object {
    Measure-LoginTime -Identifier $AdminEmail -Password "warmup-$_" | Out-Null
    Measure-LoginTime -Identifier "warmup-$_@nope.fake" -Password "warmup-$_" | Out-Null
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

Write-Host "  User existant   : ~$([Math]::Round($avgExist)) ms (essais: $($existingTimes -join ', '))" -ForegroundColor Gray
Write-Host "  User inexistant : ~$([Math]::Round($avgNoExist)) ms (essais: $($nonExistTimes -join ', '))" -ForegroundColor Gray
Write-Host "  Difference      : $([Math]::Round($diff)) ms"

if ($diff -lt 50) {
    Write-Host "`n  H-05 OK (ecart < 50ms)" -ForegroundColor Green -BackgroundColor DarkGreen
} elseif ($diff -lt 100) {
    Write-Host "`n  H-05 modere (ecart $([Math]::Round($diff))ms)" -ForegroundColor Yellow
} else {
    Write-Host "`n  H-05 KO (ecart $([Math]::Round($diff))ms)" -ForegroundColor Red
}

# ============================================================================
# Test BDD : tables existent ?
# ============================================================================

Write-Host "`n==> Test BDD - tables H-06/H-07" -ForegroundColor Cyan

$ApiDir = Join-Path $RepoRoot 'apps\api'
$verifyScript = @'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT to_regclass('public.login_attempts')::text AS la, to_regclass('public.audit_logs')::text AS al`
  .then(r => {
    console.log('LOGIN_ATTEMPTS:' + (r[0].la !== null));
    console.log('AUDIT_LOGS:' + (r[0].al !== null));
    return p.$disconnect();
  })
  .catch(e => { console.error('ERR:' + e.message); process.exit(1); });
'@

$verifyFile = Join-Path $ApiDir "verify-tables.cjs"
Set-Content -Path $verifyFile -Value $verifyScript -Encoding UTF8

Push-Location $ApiDir
try {
    $output = node "verify-tables.cjs" 2>&1 | Out-String
    Remove-Item $verifyFile -Force -ErrorAction SilentlyContinue

    $loginOk = $output -match 'LOGIN_ATTEMPTS:true'
    $auditOk = $output -match 'AUDIT_LOGS:true'

    Write-Host ("  login_attempts : " + $(if ($loginOk) { 'OK' } else { 'MANQUANTE' })) -ForegroundColor $(if ($loginOk) { 'Green' } else { 'Red' })
    Write-Host ("  audit_logs     : " + $(if ($auditOk) { 'OK' } else { 'MANQUANTE' })) -ForegroundColor $(if ($auditOk) { 'Green' } else { 'Red' })

    if (-not $loginOk -or -not $auditOk) {
        Write-Host "`n==> Creation des tables manquantes" -ForegroundColor Cyan

        $createScript = @'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const SQLS = [
  `CREATE TABLE IF NOT EXISTS "login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "login_attempts_attempt_key_key" ON "login_attempts"("attempt_key")`,
  `CREATE INDEX IF NOT EXISTS "login_attempts_blocked_until_idx" ON "login_attempts"("blocked_until")`,
  `CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(255),
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs"("user_id")`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action")`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC)`,
];

(async () => {
  try {
    for (const sql of SQLS) await p.$executeRawUnsafe(sql);
    console.log('TABLES_CREATED');
  } catch (e) {
    console.error('CREATE_ERR:' + e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
'@

        $createFile = Join-Path $ApiDir "create-tables.cjs"
        Set-Content -Path $createFile -Value $createScript -Encoding UTF8
        $createOut = node "create-tables.cjs" 2>&1 | Out-String
        Remove-Item $createFile -Force -ErrorAction SilentlyContinue

        if ($createOut -match 'TABLES_CREATED') {
            Write-Host "  Tables creees" -ForegroundColor Green
        } else {
            Write-Host "  Echec creation :" -ForegroundColor Red
            Write-Host "  $createOut" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  Erreur : $_" -ForegroundColor Red
}
Pop-Location

Write-Host ""
