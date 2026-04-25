# GifStudio-X — Etape 9.5

## Contenu

- Page `/library` avec filtres (source, statut, date, duree, dimensions, recherche) + tri + pagination
- Thumbnails JPG generees automatiquement a l'import (ffmpeg, 320px, frame a 1s)
- Preview au hover sur icone video dans la table
- Endpoint `GET /videos/:id/thumbnail` (auth cookie)
- Bouton "Thumbnails" pour regenerer celles manquantes (utile pour les videos importees avant 9.5)
- Dashboard : carte "Bibliotheque" activee

## Fichiers

### Backend
- `apps/api/prisma/schema.prisma` *(maj)* — ajout `thumbnailPath` sur VideoAsset
- `apps/api/prisma/migrations/20260423220000_add_video_thumbnail/migration.sql` *(nouveau)*
- `apps/api/src/lib/ffmpeg-thumbnail.ts` *(nouveau)*
- `apps/api/src/services/video-thumbnail-service.ts` *(nouveau)*
- `apps/api/src/services/video-import-service.ts` *(maj)* — appelle thumbnail apres probe
- `apps/api/src/services/video-upload-service.ts` *(maj)* — idem
- `apps/api/src/controllers/videos-controller.ts` *(maj)* — filtres avances + thumbnail + regen
- `apps/api/src/routes/videos.ts` *(maj)* — routes thumbnail / regenerate

### Shared
- `packages/shared/src/types/video-asset.ts` *(maj)* — ajout `thumbnailPath`, `VideoAssetFilters`, `VideoAssetListResponse`, `VideoAssetSort`

### Frontend
- `apps/web/lib/videos-service.ts` *(maj)* — `listAdvanced`, `thumbnailUrl`, `regenerateThumbnail`, `regenerateAllThumbnails`
- `apps/web/components/library/ThumbnailHover.tsx` *(nouveau)*
- `apps/web/app/(auth)/library/page.tsx` *(nouveau)*
- `apps/web/app/(auth)/dashboard/page.tsx` *(maj)* — carte "Bibliotheque" active

## Procedure

### 1. Decompresser

Decompresser `gifstudio-x-etape-9.5.zip` dans `C:\gifstudio-x\` en ecrasant.

### 2. Migration Prisma

```powershell
cd C:\gifstudio-x
pnpm db:migrate
```

Nom de migration : `add_video_thumbnail` (ou accepter le nom propose).

### 3. Pas de nouvelles dependances

Tout ce qui est utilise est deja installe (multer, axios, zod, ffmpeg binaire natif).

### 4. Relancer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

1. http://localhost:3003/dashboard → carte **Bibliotheque** active, clic dessus
2. La page `/library` s'affiche avec ton historique de videos importees
3. Clique le bouton **"Thumbnails"** en haut a droite → genere les thumbnails manquantes pour les videos deja importees avant 9.5
4. Survole l'icone a gauche de chaque ligne → popup avec la thumbnail 320px
5. Teste les filtres :
   - Saisis un bout de nom de fichier dans la recherche
   - Filtre par source (URL / Upload)
   - Filtre par duree (min/max en secondes)
   - Change le tri (recentes, anciennes, duree, taille)
6. Pagination en bas (25 / 50 / 100)

## Debug

### Popper thumbnail vide / erreur CORS
Le cookie doit etre transmis avec `crossOrigin="use-credentials"` sur `<img>`. Si ca ne marche pas, verifier que l'API renvoie bien `Access-Control-Allow-Credentials: true` et `Access-Control-Allow-Origin: http://localhost:3003` (pas `*`).

### Thumbnail ne se genere pas a l'import
Verifier que `ffmpeg` (pas seulement `ffprobe`) est dans le PATH : `ffmpeg -version` doit repondre. FFmpeg inclut les 2 binaires.

### Regenerate batch prend du temps
Normal : ffmpeg traite les videos une par une. Pour 50 videos, compter ~1 min. Pas de barre de progression pour l'instant (a voir en 10.x si besoin).

## Prochaine etape

**10.x** — Agent de veille :
- Infrastructure scheduler (node-cron + pg-boss)
- Adaptateurs Reddit / Redgifs / Rule34 / E621 / GenericHTML
- Source `crawler` devient utilisee dans `VideoAsset.source`
