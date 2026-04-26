# GifStudio-X — Etape 10.11 : Watermark complet

## Contenu

- **BDD** : nouvelle table `user_settings` (jsonb) — base pour toute future preference
- **Backend** : 
  - `GET/PATCH /settings` (la config user)
  - `POST/DELETE/GET /settings/watermark/logo` (upload/suppression/affichage du logo PNG)
  - Service `user-settings-service.ts` avec storage logo dans `/storage/watermarks/{userId}.png`
  - Sharp pour redim/conversion PNG (max 1024x1024, max 2 Mo)
- **Frontend** :
  - Page `/settings` avec onglet Watermark
  - `<WatermarkEditor>` reutilisable (settings + dialog d'export)
  - `<PositionPicker>` grille 3x3
  - Apercu live (canvas-based, simulation CSS) sous l'editeur
  - Lien Parametres dans la Topbar (icone engrenage) + a ajouter dans le UserMenu
- **Pipeline export** :
  - Compose le watermark en PNG via Canvas cote browser
  - FFmpeg WASM applique l'overlay + regenere la palette du GIF (preserve la qualite)
  - Toggle "Appliquer le watermark" + bouton "Modifier pour cet export"

## Fichiers livres

### Backend
- `apps/api/prisma/schema.prisma` *(maj)* — model UserSettings
- `apps/api/prisma/migrations/20260426000000_add_user_settings/migration.sql` *(nouveau)*
- `apps/api/src/services/user-settings-service.ts` *(nouveau)*
- `apps/api/src/controllers/user-settings-controller.ts` *(nouveau)*
- `apps/api/src/routes/settings.ts` *(nouveau)*

### Shared
- `packages/shared/src/types/user-settings.ts` *(nouveau)*

### Frontend
- `apps/web/lib/settings-service.ts` *(nouveau)*
- `apps/web/lib/watermark-applier.ts` *(nouveau)* — overlay canvas + filter FFmpeg
- `apps/web/lib/watermark-pipeline.ts` *(nouveau)* — orchestration export -> watermark
- `apps/web/components/settings/PositionPicker.tsx` *(nouveau)*
- `apps/web/components/settings/WatermarkEditor.tsx` *(nouveau)*
- `apps/web/components/editor/WatermarkOverrideDialog.tsx` *(nouveau)*
- `apps/web/app/(auth)/settings/page.tsx` *(nouveau)*
- `apps/web/app/(auth)/create/editor/page.tsx` *(maj)* — bloc Watermark + post-export
- `apps/web/components/Topbar.tsx` *(maj)* — icone Parametres

## Procedure d'installation

### 1. Decompresser

Extraire `gifstudio-x-etape-10.11.zip` en ecrasant.

### 2. Migration BDD

```powershell
cd C:\gifstudio-x
pnpm db:migrate
# Nom : add_user_settings
pnpm prisma generate --filter api
```

### 3. PATCHES MANUELS (3 fichiers)

#### 3.1 `packages/shared/src/index.ts`

Ajouter l'export :
```ts
export * from './types/user-settings';
```

#### 3.2 `apps/api/src/server.ts`

Ajouter l'import et le mount :
```ts
// En haut, avec les autres imports de routes :
import { settingsRouter } from './routes/settings';

// Dans la section ou tu monte les autres routes (apres les autres app.use) :
app.use('/api/v1/settings', settingsRouter);
```

#### 3.3 `apps/web/components/UserMenu.tsx`

Ajouter un item "Parametres" dans le menu deroulant :
```tsx
import SettingsIcon from '@mui/icons-material/Settings';
import Link from 'next/link';

// Dans le menu, AVANT le bouton de deconnexion :
<MenuItem component={Link} href="/settings" onClick={handleClose}>
  <ListItemIcon>
    <SettingsIcon fontSize="small" />
  </ListItemIcon>
  Parametres
</MenuItem>
```
(Adapter aux imports/style existants du composant.)

### 4. Verifier la dependance `sharp`

Le service utilise `sharp` (deja present pour les thumbnails crawler), donc rien a installer en theorie. Si erreur :
```powershell
pnpm install --filter api
```

### 5. Redemarrer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

### Test 1 : Page /settings
1. Se connecter -> cliquer icone engrenage en haut a droite
2. Onglet Watermark s'affiche, watermark desactive par defaut
3. Activer le toggle, modifier le texte ("Mon site"), choisir position bottom-right
4. Apercu en bas met a jour
5. Cliquer **Enregistrer** -> toast "Parametres enregistres"
6. Recharger la page -> les valeurs sont persistees

### Test 2 : Upload logo
1. Mode "Logo uniquement" ou "Texte + logo"
2. Cliquer "Choisir un logo" -> selectionner un PNG transparent
3. Le logo apparait dans l'apercu
4. Enregistrer
5. Cliquer "Supprimer" -> logo retire

### Test 3 : Export avec watermark
1. Library -> 🎬 sur une video -> Decouper -> Generer le GIF
2. Continuer vers l'editeur
3. En bas a droite, le panneau "Watermark" affiche le mode choisi
4. Toggle ON par defaut si tu l'avais active dans /settings
5. Eventuellement cliquer "Modifier pour cet export" pour changer position/texte sans toucher aux defaults
6. Cliquer "Exporter" -> 2 phases (export classique 0-70% + watermark 70-100%)
7. Le GIF final affiche le watermark

### Test 4 : Limites
1. Upload d'un fichier > 2 Mo -> erreur 400 "Trop volumineux"
2. Upload d'un .txt -> erreur 400 "Type non supporte"
3. Texte vide + mode text -> watermark non applique (rien a render)

## Notes techniques

### Stockage logo
- Disque : `/storage/watermarks/{userId}.png`
- Sharp redimensionne automatiquement a max 1024x1024
- 1 logo par utilisateur (override sur upload)

### Apercu vs rendu reel
- Apercu = CSS, simulation visuelle simple
- Rendu reel = FFmpeg WASM avec filter complex `overlay + palettegen + paletteuse`
- L'apercu CSS peut differer legerement du rendu final (notamment polices systeme vs Impact)

### Performance
- L'application du watermark ajoute une passe FFmpeg supplementaire (~30% du temps d'export initial)
- Pour un GIF de 5s a 480p, compter ~5-10s en plus selon la machine

## Limites connues / TODO futur

- L'apercu CSS utilise les polices systeme (le rendu Impact peut differer du rendu canvas FFmpeg)
- Pas de rotation du watermark (toujours horizontal)
- Pas d'animation (texte fixe pendant la duree du GIF)
- 1 seul watermark par export (pas de stacking)
