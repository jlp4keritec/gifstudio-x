# GifStudio-X — Etape 10.2 : Redgifs + resolver URL

## Contenu

- **Adaptateur Redgifs** : tag (Mode A) ou query libre (Mode B)
- **Client Redgifs** avec token temporaire auto-renouvele (valable 24h)
- **Resolver URL** : transforme les URLs `redgifs.com/watch/xxx` en .mp4 directes a l'import
- `importVideoFromUrl` appelle le resolver avant download (pas besoin de changer les URL cote crawler Reddit : elles seront resolues a la validation)
- Dialog frontend avec template Redgifs pre-rempli

## Fichiers

### Backend
- `apps/api/src/lib/redgifs-client.ts` *(nouveau)*
- `apps/api/src/services/crawler/adapters/redgifs-adapter.ts` *(nouveau)*
- `apps/api/src/services/url-resolver.ts` *(nouveau)*
- `apps/api/src/services/crawler/registry.ts` *(maj)* — enregistre Redgifs
- `apps/api/src/services/video-import-service.ts` *(maj)* — appelle le resolver + UA browser

### Frontend
- `apps/web/components/crawler/CrawlerSourceDialog.tsx` *(maj)* — template Redgifs

## Procedure

### 1. Decompresser le zip (ecraser les fichiers)

### 2. Pas de deps, pas de migration

Tout utilise axios et Prisma deja installes.

### 3. Relancer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

### A. Nouveau crawler Redgifs

1. http://localhost:3003/admin/crawler → **Nouvelle source**
2. Nom : `redgifs cute`
3. Adapter : `redgifs`
4. Config (auto-rempli) :
   ```json
   {
     "mode": "tag",
     "tag": "cute",
     "order": "trending",
     "quality": "hd",
     "minDurationSec": 0
   }
   ```
5. Cron : `*/15 * * * *`
6. Creer → Play → attendre 5-10s → Rafraichir
7. Onglet Resultats : 20 nouvelles entrees, source `redgifs cute`

### B. Import URL direct Redgifs

Avant 10.2 : tenter d'importer `https://redgifs.com/watch/xxx` → echec (pas un .mp4).
Apres 10.2 : ca fonctionne car le resolver extrait l'URL .mp4 directe.

1. http://localhost:3003/import
2. Coller une URL Redgifs (ex: `https://www.redgifs.com/watch/eminentjollyweevil`)
3. Importer → telecharge en tant que `url_import` avec le titre Redgifs

### C. Validation depuis Reddit → Redgifs auto-resolu

Si un post Reddit pointe vers redgifs.com (assez courant sur les subs video) :
- Le crawler Reddit recupere l'URL `redgifs.com/watch/xxx`
- Clic Approuver sur ce resultat
- Le resolver Redgifs transforme en .mp4
- Download OK

## Modes Redgifs

### Mode tag (listing par tag)
```json
{
  "mode": "tag",
  "tag": "cute",
  "order": "trending",      // "trending" | "new" | "top" | "best"
  "quality": "hd",           // "hd" ou "sd"
  "minDurationSec": 3         // ignore les gifs tres courts
}
```

### Mode query (recherche libre, accepte mots-cles)
```json
{
  "mode": "query",
  "query": "puppy running grass",
  "order": "top",
  "quality": "hd"
}
```

## Debug

### Token invalid / 401
Le client auto-invalide et retente une fois. Si persistant, verifier que `api.redgifs.com` est accessible depuis ton IP.

### `Redgifs : aucune URL video disponible`
Le GIF existe mais n'a pas d'URL hd/sd (rare, souvent retire). On laisse tomber.

### Thumbnails vides dans l'onglet Resultats
Les thumbnails Redgifs (thumbs4.redgifs.com) sont chargees en hotlink par le navigateur. Si tu as un adblock / VPN, ca peut echouer. Pas bloquant pour l'import.

## Prochaine etape

- **10.3** : adaptateurs Rule34 + E621 (API booru, JSON simple, pas de token)
- **10.4** : GenericHTML parametrable (regex/selecteurs CSS)
- **10.5** : Export par lot
