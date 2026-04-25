# GifStudio-X — Etape 10.7 : Refaire dans l'editeur de cadre/texte

## Contenu

- Le bouton **Refaire** sur la vue resultat de l'editeur (apres export crop/texte/filtres) :
  - Garde le **GIF source** charge (issu de l'etape Decouper)
  - Vide le resultat final exporte
  - Reset l'EditorContext (textes, crop, filtres, vitesse remis a leur valeur par defaut)
  - Te ramene sur le canvas pret pour une nouvelle edition

## Fichiers

- `apps/web/app/(auth)/create/editor/page.tsx` *(maj)*

## Procedure

Decompresser en ecrasant. Hot reload.

## Test

1. Aller sur `/library` -> clic 🎬 sur une video
2. Decouper -> Generer le GIF -> Continuer (vers l'editeur)
3. Ajouter du texte / un crop / un filtre -> **Exporter le GIF**
4. Sur la vue resultat, cliquer **Refaire**
5. Tu reviens sur le canvas avec le GIF source intact, mais **sans** les modifications precedentes
6. Tu peux refaire un autre crop/texte/filtre

## Pour vraiment tout reset

- Bouton retour (fleche) -> retour `/create/edit` -> Annuler -> retour `/create`
- Ou utiliser la nav (Bibliotheque pour piocher une autre video)
