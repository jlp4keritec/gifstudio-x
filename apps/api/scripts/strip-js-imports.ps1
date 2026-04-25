# ============================================================================
# Retire les ".js" des imports relatifs TypeScript
# Version robuste avec affichage detaille
# ============================================================================

param(
    [string]$Root = "C:\gifstudio\apps\api\src"
)

Write-Host ""
Write-Host "==> Recherche dans $Root" -ForegroundColor Cyan

$files = Get-ChildItem -Path $Root -Recurse -Include *.ts -File
Write-Host "    $($files.Count) fichier(s) TypeScript trouve(s)" -ForegroundColor Gray
Write-Host ""

$totalFixed = 0
$totalModified = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    if ([string]::IsNullOrEmpty($content)) { continue }

    # Compte les .js avant
    $beforeCount = ([regex]::Matches($content, "(from\s+['""])(\.[^'""]+?)\.js(['""])")).Count

    if ($beforeCount -eq 0) { continue }

    # Remplace : from './xxx.js' -> from './xxx'
    $newContent = [regex]::Replace($content, "(from\s+['""])(\.[^'""]+?)\.js(['""])", '$1$2$3')

    # Verifie aussi les exports : export ... from './xxx.js'
    $newContent = [regex]::Replace($newContent, "(export\s+.*?from\s+['""])(\.[^'""]+?)\.js(['""])", '$1$2$3')

    if ($newContent -ne $content) {
        # Ecriture en UTF-8 SANS BOM pour eviter les problemes
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)

        $relativePath = $file.FullName.Substring($Root.Length + 1)
        Write-Host "    [FIX] $relativePath ($beforeCount imports)" -ForegroundColor Green
        $totalModified++
        $totalFixed += $beforeCount
    }
}

Write-Host ""
Write-Host "==> Termine" -ForegroundColor Cyan
Write-Host "    $totalModified fichier(s) modifie(s), $totalFixed import(s) corrige(s)" -ForegroundColor Green
Write-Host ""
