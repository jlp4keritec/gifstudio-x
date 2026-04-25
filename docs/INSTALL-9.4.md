# GifStudio-X — Etape 9.4 : Import par lot de fichiers

> Prerequis : etape 9.3 validee (import URL fonctionnel).

---

## Ce que cette etape apporte

- **Nouveau tab "Upload"** sur la page `/import` (a cote du tab "URL")
- **Drag & drop** de plusieurs fichiers videos en une fois
- **File d'attente** avec **3 uploads en parallele** maximum
- **Barre de progression** par fichier pendant l'upload (XMLHttpRequest avec progress)
- **Nouveau endpoint** API `POST /videos/upload` (multipart/form-data)
- **Colonne "Source"** dans le tableau (URL / Upload / Crawler)

---

## Fichiers a ajouter / remplacer

Decompresse `gifstudio-x-etape-9.4.zip` dans `C:\gifstudio-x\` en ecrasant les fichiers existants.

### Nouveaux fichiers (3)

- `apps/api/src/middlewares/video-asset-upload.ts` (multer)
- `apps/api/src/services/video-upload-service.ts` (ecriture disque + probe)
- `apps/web/components/import/VideosUploader.tsx` (composant drag&drop)

### Fichiers mis a jour (4)

- `apps/api/src/controllers/videos-controller.ts` (ajout action `uploadFile`)
- `apps/api/src/routes/videos.ts` (ajout route `POST /videos/upload`)
- `apps/web/lib/videos-service.ts` (ajout methode `upload` avec `onProgress`)
- `apps/web/app/(auth)/import/page.tsx` (refactor en tabs MUI)

---

## Procedure

### 1. Decompresser le zip

```powershell
cd C:\gifstudio-x
# Decompresser en ecrasant
Expand-Archive -Path "$env:USERPROFILE\Downloads\gifstudio-x-etape-9.4.zip" -DestinationPath "C:\gifstudio-x-9.4-tmp" -Force
Copy-Item -Path "C:\gifstudio-x-9.4-tmp\gifstudio-x-etape-9.4\*" -Destination "C:\gifstudio-x\" -Recurse -Force
Remove-Item "C:\gifstudio-x-9.4-tmp" -Recurse -Force
```

### 2. Pas de nouvelles dependances

Toutes les libs utilisees (multer, zod, etc.) sont deja installees a l'etape 9.3. Pas besoin de `pnpm install`.

### 3. Pas de migration Prisma

Le modele `VideoAsset` existe deja. Les uploads utilisent juste `source = 'file_upload'` au lieu de `'url_import'`. Pas de migration.

### 4. Relancer `pnpm dev`

Si l'app tourne deja, le hot reload devrait detecter les changements. Sinon :

```powershell
cd C:\gifstudio-x
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

---

## Test

1. Ouvre http://localhost:3003/import
2. Tu dois voir **2 tabs** : "URL" (actif par defaut) et "Upload"
3. Clique sur le tab **Upload**
4. Tu vois la dropzone :
   ```
   ☁ Glisser-deposer vos videos ici
   ou cliquer pour selectionner depuis votre ordinateur
   .mp4 / .webm / .mov / .mkv / .avi — max 500 Mo / fichier, 10 min / video — 3 uploads en parallele
   ```
5. Drag & drop **5 fichiers video** depuis ton PC (ou clic pour ouvrir le file picker)
6. Tu dois voir :
   - **3 barres de progression** simultanees (les 3 premiers)
   - Les 2 autres en statut **"en attente"**
   - Des qu'un fichier se termine (OK ou failed), le suivant demarre automatiquement
7. A la fin, les chips en haut indiquent **"N OK"** et/ou **"N echec"**
8. Le tableau **"Videos importees"** se met a jour automatiquement avec les nouvelles videos (colonne **Source = "Upload"**)
9. Bouton **"Effacer termines"** pour nettoyer la file une fois tout fini

---

## Debug

### "Type de fichier non supporte"
L'extension doit etre dans la liste : `.mp4 .webm .mov .mkv .avi .m4v .ogv`. Sinon le middleware multer rejette.

### Upload qui reste a 0%
Le cookie d'auth n'est peut-etre pas envoye. Le service utilise `xhr.withCredentials = true` donc ca doit marcher. Verifier dans Chrome DevTools Network le header `Cookie: gifstudio_x_token=...`.

### Fichier trop gros
Limite `MAX_UPLOAD_SIZE_MB=500` dans `.env`. Pour augmenter, modifier cette variable et redemarrer l'API.

### Un upload bloque les autres
Normal jusqu'a `MAX_PARALLEL=3` uploads concurrents. Si tu veux plus, modifier la constante dans `VideosUploader.tsx` ligne 18.

### Upload OK mais probe ffprobe echoue
Voir INSTALL-9.3.md section "ffprobe introuvable". Le fichier est quand meme ecrit sur disque mais marque `failed`.

---

## Ce qui change cote tableau

- **Nouvelle colonne "Source"** : badge "URL" (outlined par defaut), "Upload" (pour les fichiers locaux) ou "Crawler" (futur etape 10)
- Les videos uploadees apparaissent melangees aux videos importees par URL, triees par date.

---

## Prochaine etape

**9.5 — Bibliotheque de sources** :
- Page dediee `/library` avec filtres avances (par source, statut, date, duree)
- Preview video inline (sans telecharger tout le fichier)
- Preparation du modele pour les sources crawlables (ajout d'un champ `Source` configurable en prevision de l'etape 10)
