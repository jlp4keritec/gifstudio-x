# GifStudio-X — Etape 10.4 : Bibliotheque -> Editeur GIF

## Contenu

- **Backend** : nouveau systeme de **share slug** sur VideoAsset
  - `POST /videos/:id/share` (auth) -> genere ou retourne le slug existant (1 par video)
  - `DELETE /videos/:id/share` (auth) -> revoque le slug
  - `GET /videos/file/:slug` (PUBLIC, sans auth) -> stream le .mp4 avec support Range (scrubbing OK)
- **Frontend** : action **Creer un GIF** depuis la bibliotheque
  - Bouton 🎬 visible sur chaque ligne `ready`
  - Clic sur la ligne entiere = meme action
  - Cree/reutilise un slug puis route vers `/create/edit` via le DraftContext
- **Colonne "Lien"** dans la bibliotheque
  - Si pas de slug : icone "lien casse" pour generer un partage
  - Si slug : icone copie (URL complete) + revocation

## Fichiers

### Backend
- `apps/api/prisma/schema.prisma` *(maj)* — `shareSlug` sur VideoAsset
- `apps/api/prisma/migrations/20260425000000_add_video_share_slug/migration.sql` *(nouveau)*
- `apps/api/src/services/video-share-service.ts` *(nouveau)* — slugs + streaming Range
- `apps/api/src/controllers/videos-controller.ts` *(maj)* — endpoints share + serialisation shareSlug
- `apps/api/src/routes/videos.ts` *(maj)* — `/file/:slug` public + `/share`

### Shared
- `packages/shared/src/types/video-asset.ts` *(maj)* — `shareSlug`

### Frontend
- `apps/web/lib/videos-service.ts` *(maj)* — `createShareSlug`, `revokeShareSlug`, `fileUrlBySlug`
- `apps/web/app/(auth)/library/page.tsx` *(maj)* — bouton 🎬, ligne cliquable, colonne Lien

## Procedure

1. Decompresser en ecrasant
2. Migration BDD :
   ```powershell
   cd C:\gifstudio-x
   pnpm db:migrate
   # Nom : add_video_share_slug
   ```
3. Redemarrer :
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   pnpm dev
   ```

## Test

### Test 1 : Bouton "Creer un GIF"
1. http://localhost:3003/library
2. Survoler une video `ready` -> ligne entiere devient cliquable (curseur pointer)
3. Cliquer sur l'icone 🎬 a droite (ou n'importe ou sur la ligne)
4. La page passe a `/create/edit`, l'editeur charge la video
5. Tu peux selectionner une plage et exporter en GIF comme apres un upload manuel

### Test 2 : Lien public
1. Sur une video `ready`, cliquer l'icone "lien casse" dans la colonne **Lien**
2. L'icone devient bleue (lien actif). Cliquer dessus pour copier l'URL.
3. Coller l'URL dans un navigateur en navigation privee (sans cookie auth)
4. La video doit se lire (HTTP 200 ou 206 si seek)
5. Cliquer la 3e icone (warning) pour revoquer -> le lien devient 404

### Test 3 : Revocation
1. Apres revocation, l'URL pointe sur un slug inexistant -> 404
2. Cliquer "lien casse" pour regenerer un NOUVEAU slug (different du precedent)

### Test 4 : Scrubbing
Dans `/create/edit` (ou en visionnant l'URL publique dans un `<video>`), le slider doit pouvoir sauter dans la video sans tout retelecharger -> c'est le support Range qui le permet.

## Securite

- Le slug est **permanent jusqu'a revocation manuelle** (Q1=b, Q3-c choisis)
- Toute personne ayant l'URL peut acceder au fichier sans login
- 1 video = 1 slug actif (Q4=a) - generer ne cree pas de doublon
- Les anciennes videos n'ont pas de slug par defaut. Pour creer le slug a chaque clic 🎬 c'est automatique.
- En cas de fuite, la revocation invalide instantanement le lien

## Apercu colonne Lien

| Etat | Icone | Action |
|---|---|---|
| Pas de slug | 🔗 (gris, casse) | Generer un slug |
| Slug actif | 🔗 (bleu) + 📋 (copie) + 🔗 (warning) | Copier l'URL / Revoquer |

## Prochaine etape possible

- Ajout d'une page `/admin/share-links` listant tous les slugs actifs avec stats d'acces
- Auto-revocation apres N jours sans acces
- Stats d'utilisation par slug
