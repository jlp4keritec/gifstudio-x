## Integration du ConfirmProvider

Le `ConfirmProvider` doit envelopper toute l'app pour que `useConfirm()` soit dispo
dans tous les composants client.

Generalement il y a un fichier `app/providers.tsx` ou `app/layout.tsx` qui
contient deja `ThemeProvider`, `AuthProvider`, etc. Il faut y ajouter
`ConfirmProvider`.

### Exemple type de modification

Avant :
```tsx
// apps/web/app/providers.tsx
'use client';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DraftProvider } from '@/lib/draft-context';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DraftProvider>
          {children}
        </DraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

Apres :
```tsx
'use client';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DraftProvider } from '@/lib/draft-context';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DraftProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </DraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

L'ordre n'a pas d'importance pour ConfirmProvider, mais le placer
le plus interne possible est ok.
