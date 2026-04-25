# GifStudio-X — Etape 10.10 : Modale de confirmation custom

## Contenu

- Nouveau composant **`<ConfirmProvider>`** + hook **`useConfirm()`**
- Toutes les `confirm()` natives remplacees par une modale MUI dans le theme du site
- Style **danger** pour les suppressions (icone warning, bouton rouge, bordure rouge)
- Style **default** pour confirmations neutres (icone help, bouton bleu)
- L'API `useConfirm()` retourne une `Promise<boolean>` -> code metier inchange (juste `await`)

## Fichiers

- `apps/web/components/ui/ConfirmDialog.tsx` *(nouveau)* — composant + provider + hook
- `apps/web/app/providers.tsx` *(maj)* — ajout `<ConfirmProvider>`
- `apps/web/app/(auth)/library/page.tsx` *(maj)* — toutes les confirm() migrees
- `apps/web/app/(auth)/admin/crawler/page.tsx` *(maj)* — pareil

## Utilisations migrees

### Library
- Suppression unitaire d'une video
- Suppression en lot
- Revocation d'un share slug
- Regeneration globale des thumbnails

### Crawler
- Suppression d'une source
- Suppression d'un resultat
- Bulk approve / reject / delete

## API du hook

```tsx
import { useConfirm } from '@/components/ui/ConfirmDialog';

const confirm = useConfirm();

const ok = await confirm({
  title: 'Suppression',           // optionnel
  message: 'Confirmer ?',         // requis (string ou ReactNode)
  tone: 'danger',                 // 'default' | 'danger' (defaut: default)
  confirmLabel: 'Supprimer',      // optionnel (defaut: depend du tone)
  cancelLabel: 'Annuler',         // optionnel (defaut: 'Annuler')
});
if (!ok) return;
// ... action
```

## Procedure

Decompresser en ecrasant. Hot reload.

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

1. `/library` -> cocher 3 videos -> **Supprimer**
   -> Modale avec titre "Suppression en lot", icone warning rouge, bordure rouge, bouton "Supprimer 3"
2. `/library` -> cliquer la corbeille rouge sur une ligne
   -> Modale danger avec message specifique
3. `/library` -> generer un share slug -> cliquer sur l'icone revocation
   -> Modale danger "Revoquer le lien"
4. `/admin/crawler` -> Sources -> cliquer corbeille
   -> Modale danger
5. `/admin/crawler` -> Resultats -> bulk approve
   -> Modale default (style normal, pas danger) avec bouton bleu
6. Touche Echap ou clic en dehors de la modale -> annule (renvoie false)

## Pour reutiliser ailleurs

N'importe quel composant client qui veut une confirmation propre :

```tsx
'use client';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export function MonComposant() {
  const confirm = useConfirm();
  
  const handleAction = async () => {
    const ok = await confirm({
      message: 'Vraiment ?',
      tone: 'danger',
    });
    if (!ok) return;
    // ...
  };
}
```
