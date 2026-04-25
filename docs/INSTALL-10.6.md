# GifStudio-X — Etape 10.6 : Refaire garde la video source

## Contenu

- Le bouton **Refaire** (apres generation d'un GIF) ne vide plus tout
- Comportement : reset du resultat GIF + reset du trim, mais **garde la video source** chargee
- Tu retournes au step "Decouper" avec la meme video, prete pour un nouvel essai

## Fichiers

- `apps/web/lib/draft-context.tsx` *(maj)* — ajout `clearGifResult()`
- `apps/web/app/(auth)/create/edit/page.tsx` *(maj)* — `handleRestartDraft` utilise `clearGifResult()` au lieu de `clear()`

## Procedure

Decompresser en ecrasant. Hot reload.

## Test

1. Aller sur `/library`, clic 🎬 sur une video
2. Selectionner une plage, cliquer **Generer le GIF**
3. Sur l'ecran de resultat, cliquer **Refaire**
4. Tu reviens sur l'editeur, **avec la meme video chargee** (le `<video>` est visible)
5. Tu peux modifier le decoupage et regenerer un nouveau GIF

## Note

Pour repartir avec une **autre** video, utiliser :
- Le bouton **Annuler** (revient a `/create` qui propose un upload)
- La nav (Bibliotheque pour piocher une autre video, ou Import pour uploader)
