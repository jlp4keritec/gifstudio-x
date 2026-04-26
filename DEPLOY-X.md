# 🚀 GifStudio-X — Déploiement VPS (mode privé)

Guide complet de déploiement de GifStudio-X sur le VPS OVH `151.80.232.214`,
en **mode privé** (Basic Auth Nginx + HTTPS Let's Encrypt).

## 📦 Contenu du paquet

```
.
├── apps/
│   ├── api/Dockerfile          # API Express + Prisma + FFmpeg + Playwright
│   └── web/Dockerfile          # Next.js standalone
├── docker-compose.prod.yml     # Orchestration (postgres + api + web)
├── .env.production.example     # Template (.env.production sera généré)
├── .dockerignore
├── nginx/
│   └── gifstudio-x.conf        # Reverse proxy + Basic Auth + HTTPS
└── scripts/
    ├── bootstrap-vps.ps1       # Setup initial (à lancer 1 fois)
    ├── deploy.ps1              # Mise à jour (à lancer après chaque commit)
    ├── harden-vps.sh           # Hardening Ubuntu (UFW + fail2ban + ClamAV)
    └── backup-cron.sh          # Backup quotidien Postgres
```

## 🎯 Architecture déployée

```
                    Internet
                        ↓
                   ┌─────────┐
                   │  Nginx  │  ← Basic Auth (popup navigateur)
                   │  :443   │  ← HTTPS Let's Encrypt
                   └────┬────┘
                        │
            ┌───────────┴────────────┐
            ↓                        ↓
      127.0.0.1:3003          127.0.0.1:4003
      ┌──────────┐            ┌──────────┐
      │   web    │            │   api    │ + FFmpeg + Playwright
      │ Next.js  │            │ Express  │
      └──────────┘            └────┬─────┘
                                   │ (réseau Docker)
                                   ↓
                              ┌──────────┐
                              │ postgres │  Volume nommé
                              │   :5432  │
                              └──────────┘
```

## 🔐 Sécurité en place

| Couche | Mécanisme |
|---|---|
| HTTPS | Let's Encrypt (cert existant `gifstudio.toolspdf.net`) |
| Authentification niveau Nginx | Basic Auth (popup avant accès app) |
| Authentification niveau App | JWT cookies + bcrypt + login durci anti-timing |
| SSRF | Module `url-security.ts` + `safe-fetch.ts` |
| DoS | rate-limit endpoints sensibles + login |
| Container isolation | Réseau Docker dédié, ports bound 127.0.0.1 |
| Postgres | Pas exposé réseau, accès interne Docker uniquement |

## 📋 Procédure de déploiement (1ère fois)

### Étape 1 — Pousser le code sur GitHub

```powershell
cd C:\gifstudio-x

# Copier les fichiers du paquet à la racine du repo
# (Dockerfile API, web, docker-compose, nginx/, scripts/, etc.)

git add -A
git commit -m "deploy: docker + nginx + scripts VPS"
git push
```

### Étape 2 — Vérifier le DNS

```cmd
nslookup gifstudio.toolspdf.net
```

Doit retourner `151.80.232.214`. ✅ Déjà OK normalement.

### Étape 3 — Bootstrap du VPS

```powershell
cd C:\gifstudio-x\scripts
powershell -ExecutionPolicy Bypass -File .\bootstrap-vps.ps1
```

Le script va :
1. Décommissionner l'ancienne stack `gifstudio` publique
2. Cloner le repo `gifstudio-x` dans `/var/www/gifstudio-x`
3. Générer un `.env.production` avec secrets aléatoires
4. Créer le `.htpasswd` Nginx (Basic Auth)
5. Activer la conf Nginx
6. Réutiliser le cert Let's Encrypt existant

⚠️ **À la fin, le script affiche les credentials admin initiaux** — note-les !

### Étape 4 — Hardening du VPS

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_gifstudio_nopass" ubuntu@151.80.232.214 `
    "sudo bash /var/www/gifstudio-x/scripts/harden-vps.sh"
```

Met en place : UFW, fail2ban, SSH key-only, MAJ auto, ClamAV.

### Étape 5 — Premier déploiement

```powershell
cd C:\gifstudio-x\scripts
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

Compte ~10 min pour la première fois (build Playwright + Chromium).

### Étape 6 — Backup automatique

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_gifstudio_nopass" ubuntu@151.80.232.214 `
    "chmod +x /var/www/gifstudio-x/scripts/backup-cron.sh && (sudo crontab -l 2>/dev/null; echo '0 3 * * * /var/www/gifstudio-x/scripts/backup-cron.sh') | sudo crontab -"
```

### Étape 7 — Test d'accès

1. Va sur `https://gifstudio.toolspdf.net`
2. Popup Basic Auth → `admin@gifstudio-x.local` / `H6BqhGv8=Xf&&*42`
3. Login app → `admin@gifstudio.toolspdf.net` / `[mot de passe généré]`
4. Force change password → choisis ton vrai mdp

## 🔄 Mises à jour (workflow régulier)

```powershell
# 1. Modifier le code en local, tester (pnpm dev)
# 2. Commit + push
git add .
git commit -m "feat: ..."
git push

# 3. Déployer
cd scripts
.\deploy.ps1
```

## 🛠️ Commandes utiles

### Voir les logs en continu
```powershell
ssh ubuntu@151.80.232.214 `
    "cd /var/www/gifstudio-x && docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=100"
```

### Redémarrer un container
```powershell
ssh ubuntu@151.80.232.214 "docker restart gifstudio-x-api"
```

### Voir l'état
```powershell
ssh ubuntu@151.80.232.214 "docker ps --filter name=gifstudio-x"
```

### Postgres console
```powershell
ssh ubuntu@151.80.232.214 "docker exec -it gifstudio-x-postgres psql -U gifstudio_x -d gifstudio_x"
```

### Lister les backups
```powershell
ssh ubuntu@151.80.232.214 "ls -lah /var/backups/gifstudio-x/"
```

### Restaurer un backup
```powershell
ssh ubuntu@151.80.232.214 "gunzip -c /var/backups/gifstudio-x/gifstudio_x-XXXXX.sql.gz | docker exec -i gifstudio-x-postgres psql -U gifstudio_x -d gifstudio_x"
```

### Scanner le storage avec ClamAV
```powershell
ssh ubuntu@151.80.232.214 "sudo clamscan -r /var/www/gifstudio-x/storage --infected --remove=no"
```

## 🆘 Troubleshooting

### Build Docker plante "no space left"
```powershell
ssh ubuntu@151.80.232.214 "docker system prune -a -f"
```

### Conteneur API health KO en boucle
```powershell
ssh ubuntu@151.80.232.214 "docker logs --tail 100 gifstudio-x-api"
```

Causes fréquentes :
- BDD pas accessible (vérifier le réseau Docker)
- Migration Prisma plante (vérifier `DATABASE_URL`)
- Variables d'env manquantes

### Basic Auth refuse les credentials
```powershell
# Recréer le .htpasswd
ssh ubuntu@151.80.232.214 "sudo htpasswd -bcB /etc/nginx/.htpasswd-gifstudio-x 'admin@gifstudio-x.local' 'H6BqhGv8=Xf&&*42'"
ssh ubuntu@151.80.232.214 "sudo systemctl reload nginx"
```

### Cert Let's Encrypt expire
Renouvellement auto via certbot timer (déjà actif). Vérifier :
```powershell
ssh ubuntu@151.80.232.214 "sudo certbot certificates"
ssh ubuntu@151.80.232.214 "sudo systemctl list-timers | grep certbot"
```

### Recommencer de zéro

⚠️ Perte de toutes les données.

```powershell
ssh ubuntu@151.80.232.214 `
    "cd /var/www/gifstudio-x && docker compose -f docker-compose.prod.yml --env-file .env.production down -v && sudo rm -rf /var/www/gifstudio-x"

# Puis relance bootstrap-vps.ps1 -Force
```

## 📊 Monitoring minimal

Le VPS n'a pas de monitoring externe. Pour vérifier que tout tourne, ce simple
ping en GET sur `/api/v1/health` suffit (avec Basic Auth) :

```powershell
$cred = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin@gifstudio-x.local:H6BqhGv8=Xf&&*42'))
Invoke-WebRequest -Uri "https://gifstudio.toolspdf.net/api/v1/health" `
    -Headers @{ 'Authorization' = "Basic $cred" } | Select-Object StatusCode
```

Tu peux mettre ce script en tâche planifiée Windows toutes les 10 min pour
recevoir une alerte si l'API ne répond pas.

## 🔑 Credentials récap

| Where | Login | Mot de passe |
|---|---|---|
| Basic Auth Nginx | `admin@gifstudio-x.local` | `H6BqhGv8=Xf&&*42` |
| App admin | `admin@gifstudio.toolspdf.net` | `[généré par bootstrap, voir gifstudio-x-vps-credentials.txt]` |
| Postgres | `gifstudio_x` | `[généré par bootstrap]` |
| JWT | — | `[généré par bootstrap]` |

Tous les credentials générés sont sauvegardés dans :
`%USERPROFILE%\gifstudio-x-vps-credentials.txt`

---

*Dernière mise à jour : 26 avril 2026*
