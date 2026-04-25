# ============================================================================
# Cast req.params.X et req.query.X en string pour passer le strict check
# Resout les erreurs TS2322 : string | string[] not assignable to string
# ============================================================================

param(
    [string]$Root = "C:\gifstudio\apps\api\src"
)

Write-Host ""
Write-Host "==> Recherche dans $Root" -ForegroundColor Cyan

$files = Get-ChildItem -Path $Root -Recurse -Include *.ts -File
$totalModified = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    if ([string]::IsNullOrEmpty($content)) { continue }

    $original = $content

    # Cas 1 : "id: req.params.id" -> "id: String(req.params.id)"
    # Pattern : id|slug|name etc suivis de req.params.xxx (pas deja entoures de String())
    $content = [regex]::Replace($content, "(\W)(req\.params\.[a-zA-Z_][a-zA-Z0-9_]*)(?!\s*\))", '$1String($2)')

    # Cas 2 : pareil pour req.query.X
    $content = [regex]::Replace($content, "(\W)(req\.query\.[a-zA-Z_][a-zA-Z0-9_]*)(?!\s*\))", '$1String($2)')

    # Annule les double-cast eventuels (String(String(req...)))
    $content = [regex]::Replace($content, "String\(String\((req\.(?:params|query)\.[a-zA-Z_][a-zA-Z0-9_]*)\)\)", 'String($1)')

    # Annule les casts dans des contextes ou ce n'est pas une expression
    # (ex: variable declarations qui se font deja avec String())
    # Pas necessaire car le pattern (?!\s*\)) evite deja les cas ou c'est suivi de )

    if ($content -ne $original) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
        $relativePath = $file.FullName.Substring($Root.Length + 1)
        Write-Host "  [FIX] $relativePath" -ForegroundColor Green
        $totalModified++
    }
}

Write-Host ""
Write-Host "==> Termine : $totalModified fichier(s) modifie(s)" -ForegroundColor Cyan
Write-Host ""
