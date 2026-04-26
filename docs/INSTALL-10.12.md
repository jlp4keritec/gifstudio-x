# GifStudio-X — Etape 10.12 : Crawler Playwright (sites JS)

## Contenu

- Nouvel adapter **`generic_browser`** base sur Playwright (Chromium headless)
- Capable de scraper des sites JS-rendered (React, Vue, lazy-load, etc.)
- 3 modes de capture combines :
  - **DOM final** (selecteurs CSS apres rendu JS)
  - **Regex** sur le HTML final
  - **Network intercept** : capture les requetes `.mp4`, `.m3u8`, `.webm` que la page fait pendant le chargement
- Actions configurables :
  - `waitForSelector` : attendre qu'un element apparaisse
  - `scrollToBottom` + `scrollPasses` : declencher le lazy-load
  - `viewport` : taille de la fenetre Chromium
  - `userAgent` : UA personnalise
- Mode test obligatoire avant de creer la source
- Securite : memes restrictions anti-SSRF que GenericHTML
- Browser singleton (1 Chromium partage entre runs, gain de RAM/temps)
- Shutdown propre lors du SIGTERM/SIGINT

## Fichiers livres

### Backend
- `apps/api/prisma/schema.prisma` *(maj)* — enum `generic_browser`
- `apps/api/prisma/migrations/20260427000000_add_generic_browser_adapter/migration.sql` *(nouveau)*
- `apps/api/package.json` *(maj)* — dependance `playwright`
- `apps/api/src/services/crawler/adapters/generic-browser-adapter.ts` *(nouveau)*
- `apps/api/src/services/crawler/registry.ts` *(maj)*
- `apps/api/src/controllers/crawler-sources-controller.ts` *(maj)* — endpoint `testGenericBrowser`
- `apps/api/src/routes/crawler.ts` *(maj)*
- `apps/api/src/server.ts` *(maj)* — shutdown Playwright

### Frontend
- `apps/web/lib/crawler-service.ts` *(maj)*
- `apps/web/components/crawler/CrawlerSourceDialog.tsx` *(maj)* — support `generic_browser`

## Procedure d'installation

### 1. Decompresser
Extraire en ecrasant les fichiers existants.

### 2. Installer Playwright

#### Sur Windows (dev)
```powershell
cd C:\gifstudio-x
pnpm install
cd apps\api
pnpm playwright:install
```

La derniere commande telecharge **Chromium** (~150 Mo) dans `~/AppData/Local/ms-playwright/`.
C'est un download initial, puis c'est cache.

#### Sur Ubuntu (prod)
```bash
cd /path/to/gifstudio-x
pnpm install
cd apps/api

# Installer les dependances systeme requises par Chromium
sudo pnpm playwright install-deps chromium

# Telecharger Chromium
pnpm playwright:install
```

Ubuntu requiert des libs systeme (libnss3, libatk, etc.). La commande `install-deps`
les installe automatiquement via apt.

### 3. Migration BDD

```powershell
cd C:\gifstudio-x
pnpm db:migrate
# Nom suggere : add_generic_browser_adapter
pnpm prisma generate --filter api
```

### 4. Redemarrer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

### Test 1 : Adapter dispo
1. `/admin/crawler` -> Nouvelle source
2. Dropdown adapter -> tu vois `generic_browser` avec mention "Playwright (sites JS, plus lent)"
3. Une bandeau bleu apparait expliquant le mode

### Test 2 : Config par defaut
La config par defaut pour `generic_browser` est :
```json
{
  "url": "https://example.com/videos",
  "waitForSelector": ".video-card",
  "scrollToBottom": true,
  "scrollPasses": 3,
  "videoSelectors": ["video[src]", "video source[src]"],
  "videoRegex": "https?://[^\"'\\s<>]+\\.(?:mp4|webm|m3u8)",
  "interceptNetwork": true,
  "viewport": { "width": 1280, "height": 720 }
}
```

### Test 3 : Site JS reel
Choisis un site JS connu pour ne pas marcher en HTML :
1. Mets l'URL dans `url`
2. Ajuste `waitForSelector` pour cibler ton element (ex: `article`, `.card`, `.video-item`)
3. Active `interceptNetwork: true`
4. Cliquer **Tester la config**
5. Attendre 10-30s
6. Tu vois 3 chips : CSS / Regex / Network
7. Le **Network capturees** est souvent le plus efficace : il liste les vraies URLs video que le JS a tentees de charger

### Test 4 : Anti-SSRF
1. Mettre `url: "http://localhost:3003"` ou `192.168.1.1`
2. Test -> erreur "Host prive non autorise"

## Config detaillee de `generic_browser`

```json
{
  "url": "https://site.com/page",         // requis, doit etre publique
  "waitForSelector": ".my-card",          // optionnel, attente element
  "waitForTimeout": 30000,                // ms, defaut 30s
  "scrollToBottom": true,                 // declencher lazy-load
  "scrollPasses": 3,                      // nombre de scrolls
  
  "videoSelectors": [                     // selecteurs CSS sur DOM final
    "video[src]",
    "video source[src]",
    "a[href$='.mp4']"
  ],
  "videoRegex": "https?://[^\"]+\\.mp4",  // regex sur HTML final + URLs reseau
  "interceptNetwork": true,               // capture les req reseau .mp4/.m3u8
  
  "thumbnailSelectors": ["img.preview"],
  "titleSelectors": ["h1.title"],
  
  "allowedExtensions": ["mp4", "webm", "m3u8"],
  
  "userAgent": "...",                     // UA custom (optionnel)
  "viewport": { "width": 1280, "height": 720 },
  
  "baseUrl": "https://site.com/"          // pour resoudre URLs relatives
}
```

## Performance

| Action | Temps |
|---|---|
| Boot Chromium (singleton, 1ere fois) | 1-2s |
| Navigation page simple | 2-5s |
| Avec scroll + lazy-load | +3-10s selon `scrollPasses` |
| Total typique par run | 10-30s |

Le browser est **partage** entre runs : il est lance au 1er run et reste en memoire (1 process). Il est ferme proprement au shutdown du serveur.

Memoire : ~150-300 Mo en idle, ~500 Mo pic en navigation.

## Troubleshooting

### "browserType.launch: Executable doesn't exist"
Tu n'as pas execute `pnpm playwright:install`. Lance-la depuis `apps/api`.

### Sur Ubuntu : "Host system is missing dependencies"
Lance `sudo pnpm playwright install-deps chromium` (avec sudo).

### Test passe mais 0 URL trouvee
- Active **interceptNetwork** (souvent c'est la qu'on capture les vraies URLs)
- Augmente `waitForTimeout` (le JS du site est peut-etre lent)
- Mets `scrollToBottom: true` si le site est en lazy-load
- Verifie que ton `waitForSelector` matche bien (sinon le code ne wait pas correctement)
- Inspecte le HTML rendu : ouvre DevTools du site cible et compare le DOM final avec tes selecteurs

### Timeout pendant la navigation
- Le site est lent OU il bloque les bots. Augmente `waitForTimeout`.
- Essaie un `userAgent` plus realiste (par defaut on utilise un Chrome 120 desktop, mais certains sites detectent quand meme)

### Memoire qui grimpe avec le temps
Le browser est cense etre garbage-collecte par instance (chaque run a son propre context et ses pages, qui sont fermees). Si fuite : redemarre l'API.

## Limites

- **Pas de bypass de Cloudflare / hCaptcha / reCAPTCHA** : si le site protege l'acces par un challenge, on ne le passe pas
- **Pas de connexion utilisateur** : pas de cookies, pas de login (a ajouter en futur si besoin)
- **Pas de support DRM** : les videos chiffrees (Widevine, FairPlay) ne sont pas extractibles
- **HLS (.m3u8)** : on capture l'URL du manifest mais le video-import-service derriere ne sait pas encore la traiter (futur travail)
