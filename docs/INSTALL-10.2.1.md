# GifStudio-X — Etape 10.2.1 : Tooltip crawler origin

## Contenu

- API retourne `crawlerOrigin` sur chaque VideoAsset (pour les videos issues du crawler)
- Badge `Source` de la bibliotheque : tooltip au survol affiche la source d'origine :
  - URL : URL complete
  - Upload : nom fichier
  - Crawler : nom de la source + adapter (ex: "testreddit (reddit)")

## Fichiers

- `apps/api/src/controllers/videos-controller.ts` *(maj)*
- `packages/shared/src/types/video-asset.ts` *(maj)* — ajout `crawlerOrigin`
- `apps/web/app/(auth)/library/page.tsx` *(maj)* — composant `SourceChip` avec tooltip

## Procedure

Decompresser en ecrasant. Hot reload suffit (pas de migration, pas de deps).

## Test

1. http://localhost:3003/library
2. Survoler un badge `Crawler` -> tooltip "testreddit (reddit)"
3. Survoler un badge `URL` -> tooltip avec l'URL complete
4. Survoler un badge `Upload` -> tooltip avec le nom de fichier
