# Patches manuels 10.11

## Contenu du zip

- `packages/shared/src/index.ts` — ajoute `export * from './types/user-settings';`
- `apps/web/components/UserMenu.tsx` — ajoute le MenuItem "Parametres" avec icone

## Procedure

Decompresser ce zip dans `C:\gifstudio-x` en ecrasant les 2 fichiers existants.

## A FAIRE EN PLUS (manuellement)

Le 3eme patch concerne **`apps/api/src/app.ts`**, pas `server.ts`.

Ouvre `apps/api/src/app.ts` et :

1. **Ajouter l'import** en haut, avec les autres routes :
   ```ts
   import { settingsRouter } from './routes/settings';
   ```

2. **Ajouter le mount** dans la fonction `createApp()`, parmi les autres `app.use('/api/v1/...')` :
   ```ts
   app.use('/api/v1/settings', settingsRouter);
   ```

Si tu veux que je te livre `app.ts` patche, upload-moi le fichier.

## Apres patches

```powershell
cd C:\gifstudio-x
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

Test : 
- Icone engrenage en haut a droite -> /settings
- Avatar en haut a droite -> menu deroulant -> "Parametres"
