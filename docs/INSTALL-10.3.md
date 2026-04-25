# GifStudio-X — Etape 10.3 : Rule34 + E621

## Contenu

- **Rule34Adapter** : API `rule34.xxx/index.php?page=dapi` (JSON public, pas d'auth)
- **E621Adapter** : API `e621.net/posts.json` (requiert UA identifiable, natif)
- Filtrage video uniquement (`.mp4` / `.webm`)
- Tags inclus/exclus + tri par date/score + seuil de score
- Templates pre-remplis dans le dialog

## Fichiers

- `apps/api/src/services/crawler/adapters/rule34-adapter.ts` *(nouveau)*
- `apps/api/src/services/crawler/adapters/e621-adapter.ts` *(nouveau)*
- `apps/api/src/services/crawler/registry.ts` *(maj)*
- `apps/web/components/crawler/CrawlerSourceDialog.tsx` *(maj)*

## Procedure

Decompresser en ecrasant. Hot reload. Aucune deps ni migration.

## Config Rule34

```json
{
  "includeTags": ["animated"],
  "excludeTags": ["gore", "scat"],
  "sort": "date",       // "date" ou "score"
  "minScore": 10
}
```

## Config E621

```json
{
  "includeTags": ["animated"],
  "excludeTags": ["gore"],
  "sort": "score",
  "minScore": 50,
  "rating": "e"          // "s" safe | "q" questionable | "e" explicit (optionnel)
}
```

E621 genere 2 requetes internes (mp4 + webm) mergees puis dedupliquees.

## Test

1. http://localhost:3003/admin/crawler → **Nouvelle source**
2. Adapter `rule34` ou `e621`, garder template, cron `0 */6 * * *`
3. Creer → ▶ Play → attendre → Rafraichir
4. Si success → onglet **Resultats** : entrees avec previews
5. Approuver une entree → download + apparait dans `/library` en Crawler

## Debug

### Rule34 : 0 resultat
Tags trop restrictifs ou inexistants. Tester sur https://rule34.xxx/index.php?page=post&s=list&tags=TAG avant.

### E621 : HTTP 403
UA bloque. Verifier que `INSTANCE_NAME` dans `.env` est renseigne (default `gifstudio-x`). L'UA envoye est `gifstudio-x/0.1 (private instance crawler)`.

### E621 : 0 resultat
E621 requiert au moins 1 tag et impose des limites strictes. Verifier les tags sur https://e621.net/posts?tags=TAG

### Rule34 renvoie des tags chaines delimites par espaces (pas un array)
Normal, l'adapter les split dans `metadata.tags`.

## Prochaine etape

- **10.4** : GenericHTML (scraping configurable via selecteurs CSS)
- **10.5** : Export par lot (selection multiple -> ZIP)
