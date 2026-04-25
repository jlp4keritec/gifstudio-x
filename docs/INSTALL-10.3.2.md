# GifStudio-X — Etape 10.3.2 : Proxy thumbnails crawler

## Contenu

- Endpoint backend `GET /admin/crawler/results/:id/thumbnail`
- Proxifie les thumbnails distantes (Rule34 / Reddit / Redgifs / E621)
- Envoie un Referer adapté au domaine cible (contourne le hotlink)
- Cache navigateur 1h
- Frontend : preview 80x50 dans la table + popper 480x360 au hover
- Securite : refuse les hosts prives (localhost, 10.x, 192.168.x, etc.)

## Fichiers

### Backend
- `apps/api/src/services/image-proxy-service.ts` *(nouveau)*
- `apps/api/src/controllers/crawler-results-controller.ts` *(maj)* — ajout `getResultThumbnail`
- `apps/api/src/routes/crawler.ts` *(maj)* — route `/results/:id/thumbnail`

### Frontend
- `apps/web/lib/crawler-service.ts` *(maj)* — `thumbnailUrl(id)`
- `apps/web/app/(auth)/admin/crawler/page.tsx` *(maj)* — composant `ResultThumbnail`

## Procedure

1. Decompresser en ecrasant
2. Pas de deps, pas de migration
3. Hot reload

## Test

1. http://localhost:3003/admin/crawler → onglet **Resultats**
2. Les vignettes apparaissent (au lieu d'icones cassees)
3. Survoler une vignette → popper 480x360 au-dessus
4. Cliquer ✓ pour valider l'import (download .mp4)

## Debug

### Vignette toujours cassée
- Verifier que le navigateur peut atteindre `http://localhost:4003/api/v1/admin/crawler/results/XXX/thumbnail` (logue dans console reseau)
- Si 502 : la source a bloque la requete meme avec Referer/UA -> pas grand chose a faire (rare)
- Si 404 : `thumbnailUrl` est null cote BDD (Reddit ne renvoie pas toujours de preview)

### Performance
Le proxy stream les images, donc pas de charge memoire. En cas de mass review (200+ resultats affiches), considerer ajouter du caching disque cote backend (10.3.3 si besoin).
