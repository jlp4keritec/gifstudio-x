# GifStudio-X — Etape 10.8 : GenericHTML adapter

## Contenu

- **GenericHtmlAdapter** : crawler universel pour scrapper n'importe quel site HTML
  - Mode CSS : selecteurs comme `video source[src]`, `a[href$=".mp4"]`, etc.
  - Mode regex : pattern applique sur le HTML brut (utile si JS, attributs custom...)
  - Les 2 modes peuvent etre combines (resultats fusionnes + dedupliques)
  - Filtre par extensions (`mp4`, `webm` par defaut)
- **Securite** :
  - Refus des hosts prives (localhost, 10.x, 192.168.x, etc.) anti-SSRF
  - Limite taille HTML : 5 Mo
  - Timeout 15s
  - Limite 1000 matches regex (protection ReDoS)
- **Mode test** : bouton "Tester la config" dans le dialog
  - Fetch la page + applique CSS + regex
  - Affiche : titre page, taille HTML, nb matches CSS, nb matches regex, URLs trouvees
  - **Aucune insertion BDD**, juste un dry-run
- Nouvelle dependance : **cheerio** (parsing HTML/CSS)

## Fichiers

### Backend
- `apps/api/package.json` *(maj)* — ajout `cheerio`
- `apps/api/src/services/crawler/adapters/generic-html-adapter.ts` *(nouveau)*
- `apps/api/src/services/crawler/registry.ts` *(maj)*
- `apps/api/src/controllers/crawler-sources-controller.ts` *(maj)* — endpoint `testGenericHtml`
- `apps/api/src/routes/crawler.ts` *(maj)* — route `POST /test-generic-html`

### Frontend
- `apps/web/lib/crawler-service.ts` *(maj)* — `testGenericHtml()`
- `apps/web/components/crawler/CrawlerSourceDialog.tsx` *(maj)* — bouton **Tester** + affichage resultat

## Procedure

1. Decompresser en ecrasant
2. Installer `cheerio` :
   ```powershell
   cd C:\gifstudio-x
   pnpm install
   ```
3. Redemarrer :
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   pnpm dev
   ```

## Test

### Test 1 : Config sans URL valide

1. http://localhost:3003/admin/crawler -> Nouvelle source
2. Adapter : `generic_html`
3. La config par defaut est :
   ```json
   {
     "url": "https://example.com/videos",
     "videoSelectors": ["video source[src]", "a[href$='.mp4']"],
     ...
   }
   ```
4. Cliquer **Tester la config** -> echec attendu (example.com n'a pas de video)

### Test 2 : Site reel

Edite la config avec une vraie page video (ex: une de tes pages perso). Modifie `url` et `videoSelectors` selon le HTML cible.

Ensuite **Tester** :
- Si CSS = 0 match : tes selecteurs ne matchent pas, regarde le DOM source
- Si regex = 0 match : le pattern ne marche pas
- Si URLs videos = 0 : les URLs trouvees ne se terminent pas par `.mp4`/`.webm` -> ajuste `allowedExtensions`

### Test 3 : Sauvegarde et run

Une fois le test concluant, **Creer** -> ▶ Lancer maintenant -> Rafraichir.

## Config GenericHTML

```json
{
  "url": "https://example.com/page",     // requis
  "baseUrl": "https://example.com/",     // optionnel, pour resoudre URLs relatives
  
  "videoSelectors": [                     // au moins l'un des 2 modes obligatoire
    "video source[src]",
    "a[href$='.mp4']",
    "div.player video"
  ],
  
  "videoRegex": "https?://[^\"'\\s]+\\.mp4",  // alternative ou complement
  
  "thumbnailSelectors": ["img.thumb"],   // optionnel
  "titleSelectors": ["h1.title"],        // optionnel
  
  "allowedExtensions": ["mp4", "webm"]   // defaut : mp4, webm, mov, mkv
}
```

## Astuces selecteurs CSS

| But | Selecteur |
|---|---|
| Tag `<video src="..."`> | `video[src]` |
| Tag `<source>` dans `<video>` | `video source[src]` |
| Liens vers .mp4 | `a[href$='.mp4']` |
| Lazy-loaded (data-src) | `video[data-src]` |
| Video dans une div precise | `.video-player video` |

## Astuces regex

Les regex sont appliquees sur le HTML brut. Pratique pour :
- URLs dans des scripts JSON inline : `"video":"(https?://[^"]+\\.mp4)"`
- URLs dans des attributs custom : `data-mp4="(https?://[^"]+)"`
- Trouver toutes les .mp4 d'une page, peu importe ou : `https?://[^"'\\s<>]+\\.mp4`

## Limites

- Pas de support JavaScript (DOM rendu cote client). Pour ca, il faudrait Playwright/Puppeteer (pas implemente pour l'instant)
- Pas de pagination automatique : 1 source = 1 URL fixe (Q2=a)
- Pas de login / cookies sur la page cible

## Prochaine etape possible

Si tu rencontres des sites avec JS render, on pourra ajouter une variante `generic_browser` avec Playwright (mais lourd : 200 Mo).
