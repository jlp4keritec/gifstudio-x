#requires -Version 5.1
$ErrorActionPreference = 'Continue'

# Login
$loginBody = '{"identifier":"admin@gifstudio-x.local","password":"AdminX123"}'
$session = $null
Invoke-WebRequest -Uri "http://localhost:4003/api/v1/auth/login" `
    -Method POST -ContentType 'application/json' -Body $loginBody `
    -SessionVariable session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
Write-Host "Login OK" -ForegroundColor Green

function Test-Url {
    param([string]$Url)
    Write-Host "`n--- Test : $Url ---" -ForegroundColor Cyan
    $body = @{ url = $Url } | ConvertTo-Json -Compress
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:4003/api/v1/videos/import-url" `
            -Method POST -ContentType 'application/json' -Body $body `
            -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "Status: $($r.StatusCode)" -ForegroundColor Yellow
        Write-Host "Body  : $($r.Content)" -ForegroundColor Yellow
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode.value__
            Write-Host "Status: $code" -ForegroundColor Yellow
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                Write-Host "Body  : $body" -ForegroundColor Yellow
            } catch {
                Write-Host "Body  : (impossible a lire)" -ForegroundColor Red
            }
        } else {
            Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Test-Url -Url "http://localhost:5432/"
Test-Url -Url "http://127.0.0.1.nip.io/foo.mp4"
Test-Url -Url "http://[::1]/foo.mp4"
Test-Url -Url "http://[0:0:0:0:0:0:0:1]/foo.mp4"
Test-Url -Url "https://example.com/foo.mp4"

Write-Host ""
