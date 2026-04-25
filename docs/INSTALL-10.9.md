# GifStudio-X — Etape 10.9 : Suppression / actions par lot

## Contenu

### Bibliotheque (`/library`)
- Checkbox sur chaque ligne
- Checkbox header pour selectionner/deselectionner toutes les lignes visibles
- Barre d'actions sticky en haut quand selection > 0
- Lien "Selectionner les N resultats" (jusqu'a 500) quand toutes les lignes visibles sont cochees mais total > visible
- Bouton **Supprimer** en lot

### Crawler resultats (`/admin/crawler` onglet Resultats)
- Pareil : checkbox + barre d'actions
- 3 actions en lot : **Approuver**, **Rejeter**, **Supprimer**
- Approuver lance les imports en parallele (max 20 simultanes)

### Backend
- `POST /videos/bulk-delete` (auth) : suppression de N videos
- `POST /admin/crawler/results/bulk` (admin) : action en lot delete/reject/approve sur N resultats
- Limite de concurrence : 20 simultanes (utilitaire `runWithConcurrency`)
- Limite par requete : 500 ids max (anti-DoS)

## Fichiers

### Backend
- `apps/api/src/lib/concurrency.ts` *(nouveau)*
- `apps/api/src/controllers/videos-controller.ts` *(maj)* — bulkDeleteVideos
- `apps/api/src/controllers/crawler-results-controller.ts` *(maj)* — bulkAction
- `apps/api/src/routes/videos.ts` *(maj)*
- `apps/api/src/routes/crawler.ts` *(maj)*

### Frontend
- `apps/web/lib/videos-service.ts` *(maj)* — bulkDelete
- `apps/web/lib/crawler-service.ts` *(maj)* — bulkAction
- `apps/web/components/library/BulkActionBar.tsx` *(nouveau)*
- `apps/web/app/(auth)/library/page.tsx` *(maj)*
- `apps/web/app/(auth)/admin/crawler/page.tsx` *(maj)*

## Procedure

Decompresser en ecrasant. Hot reload (pas de migration BDD ni nouvelle dependance).

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

### Test 1 : Suppression library
1. `/library`
2. Cocher 3 videos -> barre apparait avec "3 selectionnees"
3. Cliquer **Supprimer** -> confirmation -> les 3 disparaissent
4. Toast : "3 supprimees"

### Test 2 : Selectionner toute la page + extension
1. Coche la checkbox du header -> toutes les lignes visibles cochees
2. Si total > 25 : un lien "Selectionner les N resultats" apparait
3. Cliquer dessus -> toutes les videos du filtre sont selectionnees
4. La barre indique "Tous les N resultats selectionnes"
5. Clic "Effacer la selection" pour revenir en arriere

### Test 3 : Crawler bulk approve
1. `/admin/crawler` -> onglet Resultats
2. Cocher 5 resultats `pending_review`
3. Barre apparait avec **Approuver / Rejeter / Supprimer**
4. Cliquer **Approuver** -> confirmation
5. Toast : "Approuver : 5 OK" (ou avec echecs)
6. Apres quelques secondes les videos apparaissent en bibliotheque

### Test 4 : Bulk reject
Pareil mais sur **Rejeter** : marque les resultats `rejected` instantanement.

## Securite

- Limite **500 ids max par requete** (Zod) : evite que quelqu'un envoie 100k ids
- Limite **20 actions en parallele** : protege le serveur d'une surcharge IO/disque
- Toutes les routes protegees par auth (admin pour crawler)

## Points d'attention

- **Approuver en lot** lance des telechargements potentiellement longs. Si tu approuves 50 videos, l'API va en telecharger 20 a la fois. La requete HTTP front attend que tout soit fini -> peut prendre plusieurs minutes. Le toast "Import en cours..." s'affiche avant.
- Les **echecs ne bloquent pas** : si 3 sur 5 echouent, les 2 autres sont importees. Le toast affiche "2 OK / 3 echecs".
- En cas de plantage middle-flight, les videos partiellement traitees gardent leur etat (BDD coherente).
