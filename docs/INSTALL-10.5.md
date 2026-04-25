# GifStudio-X — Etape 10.5 : Topbar avec navigation complete

## Contenu

- Topbar enrichie sur **toutes les pages authentifiees** (dashboard, library, create, edit, admin/crawler...)
- Mix icone + texte (Q1=c)
- Liens : Dashboard, Creer un GIF, Import, Bibliotheque, Collections, Explorer
- Liens admin (admin only) : Crawler, Utilisateurs
- Page active marquee : fond legerement visible + bordure basse + texte gras (Q3=a)
- **Responsive** : sur petit ecran les labels disparaissent, seules les icones restent (avec tooltip)

## Fichiers

- `apps/web/components/Topbar.tsx` *(maj)*

## Procedure

Decompresser en ecrasant. Hot reload.

## Test

1. Aller sur n'importe quelle page authentifiee
2. La topbar contient tous les liens du dashboard
3. Le lien de la page courante est mis en avant (fond + bordure + gras)
4. Click sur "Bibliotheque" -> /library, le lien Bibliotheque devient actif
5. Click sur "Crawler" -> /admin/crawler (visible uniquement si admin)
6. Reduit la fenetre : les labels disparaissent, icones + tooltip
7. Sur la page editeur (`/create/edit`), tu as maintenant la nav directement sans avoir a revenir au dashboard

## Logique d'etat actif

- Pour la plupart des pages : exact match (pathname === href)
- Pour `/create` : prefix match (couvre `/create`, `/create/edit`, `/create/editor`)

## Notes

- Le menu utilisateur (en haut a droite) n'est pas modifie — il reste pour deconnexion / parametres compte
- Le toggle theme (sombre/clair) reste a sa place
- Le lien Dashboard est aussi accessible via le logo "GifStudio-X" comme avant
