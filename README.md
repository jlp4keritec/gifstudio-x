# GifStudio-X

> Instance privee derivee de GifStudio.
> Usage : personnel, potentiel POC commercial.
> Acces authentifie uniquement, contenu NSFW.

---

## 📋 Difference avec l'instance publique `gifstudio`

GifStudio-X est une **copie adaptee** de `gifstudio` avec :

| Element | gifstudio (public) | gifstudio-x (prive) |
|---|---|---|
| Ports | 3000 / 4000 | **3003 / 4003** |
| Base de donnees | `gifstudio` | **`gifstudio_x`** |
| User PostgreSQL | `gifstudio` | **`gifstudio_x`** |
| Cookie auth | `gifstudio_token` | **`gifstudio_x_token`** |
| APP_NAME | `GifStudio` | **`GifStudio-X`** |
| Routes `/explore`, `/g/:slug`, `/categories` | **Publiques** (anonyme OK) | **Auth obligatoire** |
| GIFs `isPublic` | Defaut `true` | Defaut `false` |
| Filtre `isPublic` dans explore | Oui | **Non** (tout visible aux auth) |
| Nouveau modele `VideoAsset` | Non | **Oui** (videos importees) |
| Route `/videos/import-url` | Non | **Oui** |
| Page `/import` | Non | **Oui** (dans `(auth)`) |
| Licence | (projet open) | **Proprietaire stricte** |

---

## 🛠️ Stack

| Couche | Techno |
|---|---|
| Frontend | Next.js 15, Material-UI v6, TypeScript |
| Backend | Express, Prisma, Node 22 |
| BDD | PostgreSQL 18 (natif Windows en dev) |
| Auth | JWT + bcrypt, cookie HTTP-only |
| Video | FFmpeg / ffprobe (binaire externe, LGPL) |

---

## 🚀 Demarrage dev local (Windows, sans Docker)

### 0. Prerequis
- Node.js 22+, pnpm 9+
- PostgreSQL 18 natif (deja installe pour instance publique)
- FFmpeg dans le PATH : `winget install --id=Gyan.FFmpeg -e`

### 1. Creer user + base PostgreSQL

```powershell
# Depuis pgAdmin ou psql, connecte en superuser postgres :
CREATE USER gifstudio_x WITH PASSWORD 'gifstudio_x_dev_pwd' CREATEDB;
CREATE DATABASE gifstudio_x OWNER gifstudio_x;
GRANT ALL PRIVILEGES ON DATABASE gifstudio_x TO gifstudio_x;
\c gifstudio_x
GRANT ALL ON SCHEMA public TO gifstudio_x;
```

(Note : `CREATEDB` necessaire pour que Prisma Migrate cree sa shadow database)

### 2. Configurer `.env`

```powershell
cd C:\gifstudio-x
Copy-Item .env.example .env
# Editer .env et remplir DATABASE_URL avec le password que tu as choisi ci-dessus
# Editer JWT_SECRET (16+ chars alea) et ADMIN_PASSWORD
notepad .env
```

### 3. Installer dependances

```powershell
pnpm install
```

### 4. Migrations Prisma + seed

```powershell
pnpm db:migrate
# nom de migration : init
pnpm db:seed
```

### 5. Lancer dev

```powershell
pnpm dev
```

- API : http://localhost:4003
- Web : http://localhost:3003
- Health : http://localhost:4003/api/v1/health

### 6. Se connecter

Aller sur http://localhost:3003 → login avec `admin@gifstudio-x.local` / `AdminX123` (ou ton ADMIN_EMAIL/ADMIN_PASSWORD du `.env`).

Le login accepte aussi juste `admin` (sans le `@...`).

---

## 📂 Structure

Identique a l'instance publique, avec ces ajouts :

```
apps/api/
├── src/
│   ├── lib/ffprobe.ts                 # Helpers FFmpeg
│   ├── services/video-import-service.ts
│   ├── controllers/videos-controller.ts
│   └── routes/videos.ts
└── prisma/schema.prisma (modele VideoAsset ajoute)

apps/web/
└── app/(auth)/import/page.tsx         # Page d'import vidéo par URL

packages/shared/
└── src/types/video-asset.ts
```

---

## 🔐 Securite / Usage

- Repo Git **PRIVE uniquement** (ne jamais pusher sur github public)
- `.env` jamais commit
- Deploiement prod non couvert pour l'instant (dev local uniquement)
- En prod future : derriere VPN WireGuard, pas de domaine public

---

## 📋 Roadmap

- **9.1** ✅ Bootstrap (base du projet public)
- **9.3** ✅ Import video par URL directe + modele VideoAsset
- **9.4** Import par lot de fichiers (upload multiple)
- **9.5** Bibliotheque de sources (UI + crawler prep)
- **10.1** Infrastructure agent (scheduler + file d'attente)
- **10.2** Adaptateur Reddit
- **10.3** Adaptateur Redgifs
- **10.4** Adaptateurs Rule34 + E621
- **10.5** Adaptateur GenericHTML paramétrable
- **10.6** Export par lot

---

## 🔏 Licence

Proprietaire stricte. Voir [LICENSE](./LICENSE).
