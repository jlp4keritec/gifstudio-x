# GifStudio-X — Etape 10.1 : Agent de veille (infra + Reddit)

## Contenu

**Backend**
- Modeles Prisma `CrawlerSource` + `CrawlerResult` (+ enums)
- Registry d'adaptateurs avec interface commune
- **Adaptateur Reddit** implemente (JSON public, pas d'auth)
- Runner : execute un CrawlerSource (fetch + dedup + insert)
- **Queue pg-boss** : persiste les jobs en BDD, 1 execution a la fois
- **Scheduler node-cron** : declenche les jobs selon le cronExpression de chaque source
- Endpoints `/admin/crawler/*` (admin only)
- Validation cron : minimum 15 min entre runs
- Dedup intelligent : URL rejetees re-crawlable apres 7 jours

**Frontend**
- Page `/admin/crawler` avec 2 onglets : Sources + Resultats
- Dialog creation/edition avec templates par adapter
- Workflow : pending_review → approve (telecharge via importVideoFromUrl) / reject

## Fichiers

### Backend
- `apps/api/prisma/schema.prisma` *(maj)* — ajout CrawlerSource + CrawlerResult
- `apps/api/prisma/migrations/20260424000000_add_crawler_models/migration.sql` *(nouveau)*
- `apps/api/package.json` *(maj)* — ajout `pg-boss` + `node-cron`
- `apps/api/src/lib/cron-validator.ts` *(nouveau)*
- `apps/api/src/services/crawler/adapter.ts` *(nouveau)* — interface
- `apps/api/src/services/crawler/adapters/reddit-adapter.ts` *(nouveau)*
- `apps/api/src/services/crawler/registry.ts` *(nouveau)*
- `apps/api/src/services/crawler/runner.ts` *(nouveau)*
- `apps/api/src/workers/crawler-queue.ts` *(nouveau)*
- `apps/api/src/workers/crawler-scheduler.ts` *(nouveau)*
- `apps/api/src/controllers/crawler-sources-controller.ts` *(nouveau)*
- `apps/api/src/controllers/crawler-results-controller.ts` *(nouveau)*
- `apps/api/src/routes/crawler.ts` *(nouveau)*
- `apps/api/src/routes/index.ts` *(maj)* — monte `/admin/crawler`
- `apps/api/src/server.ts` *(maj)* — demarre queue + scheduler

### Shared
- `packages/shared/src/types/crawler.ts` *(nouveau)*
- `packages/shared/src/index.ts` *(maj)*

### Frontend
- `apps/web/lib/crawler-service.ts` *(nouveau)*
- `apps/web/components/crawler/CrawlerSourceDialog.tsx` *(nouveau)*
- `apps/web/app/(auth)/admin/crawler/page.tsx` *(nouveau)*
- `apps/web/app/(auth)/dashboard/page.tsx` *(maj)* — ajout carte Crawler

## Procedure

### 1. Decompresser le zip dans `C:\gifstudio-x\` (ecraser)

### 2. Installer les nouvelles deps

```powershell
cd C:\gifstudio-x
pnpm install
```

Nouvelles deps : `pg-boss` (queue Postgres), `node-cron` (scheduler), `@types/node-cron`.

### 3. Migrer la BDD

```powershell
pnpm db:migrate
# Nom : add_crawler_models
```

pg-boss creera aussi ses propres tables au premier demarrage (`pgboss.*` dans le schema `pgboss`).

### 4. Relancer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

Au demarrage de l'API, tu dois voir :
```
🚀 GifStudio-X API running on http://localhost:4003
✓ ffprobe disponible
[crawler-queue] worker started (teamSize=1, teamConcurrency=1)
[crawler-scheduler] running
✓ crawler queue + scheduler demarres
```

## Test

1. http://localhost:3003/dashboard → carte **Crawler** (Admin)
2. Onglet **Sources** → bouton **Nouvelle source**
3. Remplir :
   - **Nom** : `r/oddlysatisfying`
   - **Adapter** : `reddit`
   - **Config** (auto-rempli) : laisser ou ajuster
   - **Cron** : `*/15 * * * *` (toutes les 15 min minimum)
   - **Max / run** : 20
4. Creer. La source apparait dans le tableau.
5. Cliquer **▶ Lancer maintenant** (icone play) → run enqueue, s'execute en background.
6. Attendre 5-10s puis **Rafraichir** — "Dernier run" passe a **success** avec message "X nouveaux / Y trouves".
7. Onglet **Resultats** → voir les videos trouvees, statut `pending_review`.
8. Pour chaque resultat :
   - ✓ **Approuver** : telecharge la video via `importVideoFromUrl` (asynchrone, peut prendre du temps), passe en `imported`.
   - 🚫 **Rejeter** : passe en `rejected`. L'URL pourra reapparaitre apres 7 jours si toujours sur Reddit.

## Adaptateurs

Seul **reddit** est implemente. Les autres (`redgifs`, `rule34`, `e621`, `generic_html`) apparaissent en dropdown mais disabled. Ils seront livres en 10.2 / 10.3 / 10.4 / 10.5.

## Config Reddit

```json
{
  "subreddit": "oddlysatisfying",
  "sort": "hot",              // "hot" | "new" | "top"
  "timeFilter": "day",         // pour sort=top : hour|day|week|month|year|all
  "minScore": 100,             // karma min
  "requireVideo": true,        // ignorer les posts sans video
  "nsfw": "allow"              // "only" | "allow" | "deny"
}
```

Exemples de cron utiles :
- `*/15 * * * *` — toutes les 15 min
- `0 * * * *` — toutes les heures pile
- `0 */6 * * *` — toutes les 6 heures
- `0 8,20 * * *` — 8h et 20h chaque jour

## Debug

### "Reddit HTTP 403"
User-Agent bloque. Reddit filtre les UA generiques. Notre UA est `gifstudio-x/0.1 (private instance crawler)` — si toujours bloque, changer `INSTANCE_NAME` dans `.env` pour quelque chose d'unique.

### "Reddit rate limit (HTTP 429)"
Trop de requetes. Espacer les runs (cron plus long, genre `0 */2 * * *`).

### Job n'est jamais execute
Verifier que pg-boss tourne. Dans psql :
```sql
\dt pgboss.*
SELECT * FROM pgboss.job ORDER BY created_on DESC LIMIT 10;
```

### Source ne se declenche pas automatiquement
- Verifier `enabled=true`
- Cron valide : copier-coller dans https://crontab.guru/
- Scheduler recharge toutes les 1 min, attendre un peu

### "Adaptateur X non implemente"
Normal pour redgifs/rule34/e621/generic_html en 10.1.

## Prochaines etapes

- **10.2** : Redgifs adapter + auth token
- **10.3** : Rule34 + E621 (booru API)
- **10.4** : GenericHTML paramétrable (regex / cheerio)
- **10.5** : Export par lot (selection multiple + ZIP)
