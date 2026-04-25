# GifStudio-X — Migration vers v2

> Cette version **remplace entierement** les precedents zips (9.0, 9.1, 9.3).
> La nouvelle version est construite comme une **copie adaptee** de l'instance publique `gifstudio` et non plus un projet parallele.

---

## 🎯 Ce que tu dois faire

### 1. Sauvegarder ce qui peut l'etre (si tu veux)

Si tu as passe du temps a configurer des trucs dans l'ancien `C:\gifstudio-x\` que tu veux recuperer :

```powershell
# Sauvegarder ton ancien .env au cas ou
Copy-Item C:\gifstudio-x\.env C:\gifstudio-x-backup.env -ErrorAction SilentlyContinue
```

### 2. Effacer l'ancien `C:\gifstudio-x\`

```powershell
# Stopper les processus node eventuels
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Supprimer l'ancien repertoire
Remove-Item C:\gifstudio-x -Recurse -Force -ErrorAction SilentlyContinue
```

### 3. Nettoyer la BDD existante

Comme on change le schema (ajout de `video_assets` + modification `Gif.isPublic` default) et qu'on supprime les migrations, le plus simple est de **dropper et recreer la base** :

```powershell
# En superuser postgres :
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS gifstudio_x;"
psql -U postgres -h localhost -d postgres -c "DROP USER IF EXISTS gifstudio_x;"

# Puis recreer (avec CREATEDB pour Prisma Migrate shadow DB)
psql -U postgres -h localhost -d postgres -c "CREATE USER gifstudio_x WITH PASSWORD 'gifstudio_x_dev_pwd' CREATEDB;"
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE gifstudio_x OWNER gifstudio_x;"
psql -U postgres -h localhost -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE gifstudio_x TO gifstudio_x;"
psql -U postgres -h localhost -d gifstudio_x -c "GRANT ALL ON SCHEMA public TO gifstudio_x;"
```

Tu peux aussi le faire via pgAdmin si tu preferes l'interface graphique.

### 4. Decompresser le zip

```powershell
# Decompresser gifstudio-x-v2.zip dans C:\
# Le resultat doit etre C:\gifstudio-x\ avec toute la structure
Expand-Archive -Path "$env:USERPROFILE\Downloads\gifstudio-x-v2.zip" -DestinationPath "C:\" -Force
# Note : si le zip contient un dossier gifstudio-x-v2, tu peux le renommer en gifstudio-x
# ou adapter le chemin
```

Verifie l'arborescence apres decompression :

```powershell
cd C:\gifstudio-x
dir
# Tu dois voir : apps, packages, scripts, docker-compose.*.yml, CONTEXT.md, README.md, LICENSE, package.json, etc.
```

### 5. Configurer `.env`

```powershell
cd C:\gifstudio-x
Copy-Item .env.example .env
notepad .env
```

A remplir :
- **DATABASE_URL** : remplacer `CHANGE_ME_DEV_PWD` par `gifstudio_x_dev_pwd` (ou ton choix de l'etape 3)
- **JWT_SECRET** : generer 64 chars alea

```powershell
# Generer JWT_SECRET :
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

- **ADMIN_EMAIL** : `admin@gifstudio-x.local` (ou ton choix)
- **ADMIN_PASSWORD** : `AdminX123` (ou ton choix, peu importe car `FORCE_PASSWORD_CHANGE=false`)

### 6. Installer les dependances

```powershell
pnpm install
```

Temps : 1-2 min (nouvelles deps : `axios`, `execa` cote API).

### 7. Verifier FFmpeg

```powershell
ffprobe -version
```

Si non installe :
```powershell
winget install --id=Gyan.FFmpeg -e
# Puis fermer et rouvrir PowerShell pour que le PATH se mette a jour
```

### 8. Migrations Prisma + seed

```powershell
cd C:\gifstudio-x

# IMPORTANT : il faut copier .env aussi dans apps/api/ pour que Prisma le trouve
# (comme pour l'ancienne version)
Copy-Item .env apps\api\.env -Force

pnpm db:migrate
# Nom de migration : init

pnpm db:seed
```

### 9. Lancer l'app

```powershell
pnpm dev
```

Tu dois voir :
```
🚀 GifStudio-X API running on http://localhost:4003
✓ ffprobe disponible
▲ Next.js 15 - Local: http://localhost:3003
```

### 10. Tester

- Ouvre http://localhost:3003
- Login avec `admin` (ou ton email complet) + ton password
- Tu arrives sur le dashboard avec 5 cartes :
  - Creer un GIF (comme instance publique)
  - **Import URL** (nouveau)
  - Mes collections
  - Explorer
  - Gestion utilisateurs (admin)
- Clique **Import URL**, colle une URL .mp4 de test :
  ```
  https://sample-videos.com/video321/mp4/240/big_buck_bunny_240p_1mb.mp4
  ```
- Importe, tu dois voir la video apparaitre dans le tableau en statut `ready`

---

## ✅ Ce qui est identique a l'instance publique

- Parcours login (`identifier` accepte email OU username ex: `admin`)
- Pas de forcage de changement de mdp en dev (`FORCE_PASSWORD_CHANGE=false`)
- 3 themes (Dark, Medium, Light) via le toggle topbar
- Topbar avec menu user, theme toggle
- Pages existantes : `/create`, `/collections`, `/explore`, `/g/[slug]`, `/admin/users`, `/profile`, `/change-password`
- Cookie HTTP-only (pas de localStorage JWT)
- Structure monorepo pnpm

---

## 🔄 Ce qui est different

- Ports **3003 / 4003** au lieu de 3000 / 4000
- BDD `gifstudio_x` (user et base)
- `/explore`, `/g/:slug` exigent maintenant **une authentification** (plus d'acces anonyme)
- Default `Gif.isPublic = false` (tout cree est prive par defaut)
- Plus de filtre `isPublic` dans `/explore` : en instance privee, tous les GIFs sont visibles aux users authentifies
- Nouveau modele `VideoAsset` + page `/import`
- `APP_NAME = 'GifStudio-X'`
- Licence proprietaire stricte

---

## 🐛 Debug

### "Prisma shadow database permission denied"
User sans `CREATEDB`. Refaire l'etape 3 avec `CREATEDB` dans la creation du user :
```sql
ALTER USER gifstudio_x CREATEDB;
```

### "ffprobe introuvable"
Installer FFmpeg et fermer/rouvrir PowerShell (voir etape 7).

### "Cannot find module @gifstudio-x/shared"
`pnpm install` pas termine ou workspace cassé. Relancer :
```powershell
pnpm install
```

### Port 4003 ou 3003 deja utilise
L'instance publique ou un autre process tourne. Soit stopper l'autre :
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```
Soit changer les ports dans `.env`.

---

## 🎯 Apres validation

Une fois que tu as confirme que tout fonctionne comme attendu (login + dashboard + import URL), on passe aux etapes suivantes :

- **9.4** : import par lot de fichiers (drag & drop multiple)
- **9.5** : bibliotheque de sources (UI + preparation crawler)
- **10.x** : agent de veille (Reddit, Redgifs, Rule34, E621, GenericHTML)

Tu valides cette installation en m'envoyant un screenshot du dashboard ou en confirmant que `pnpm dev` demarre sans erreur et que l'import URL fonctionne.
