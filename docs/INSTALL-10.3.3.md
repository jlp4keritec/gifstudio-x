# GifStudio-X — Etape 10.3.3 : Compteur résultats à jour + auto-refresh

## Contenu

- Au chargement de la page : compteur "Resultats (X)" rempli immediatement (fetch leger limit=1)
- **Polling auto** toutes les 10s tant que la page est visible (status sources + compteur)
- Apres un clic ▶ Play : refresh apres 3s (laisse le temps au crawler de s'executer)
- Apres creation/suppression source : refresh complet
- Polling pause si l'onglet n'est pas visible (economise les ressources)

## Fichiers

- `apps/web/app/(auth)/admin/crawler/page.tsx` *(maj)*

## Procedure

Decompresser en ecrasant. Hot reload.

## Test

1. Aller sur `/admin/crawler` -> compteur "Resultats (94)" affiche immediatement (avant : "Resultats (0)" puis se met a jour au clic d'onglet)
2. Cliquer ▶ Play sur une source -> attendre 3s -> "Dernier run" passe en `success`, compteur "Resultats" augmente
3. Laisser la page ouverte 10-20s -> mise a jour automatique sans rien faire
4. Si le cron declenche tout seul, tu vois aussi le compteur evoluer

## Comportement

| Action | Refresh |
|---|---|
| Mount page | sources + compteur |
| Tab Resultats | + liste resultats |
| Toutes les 10s | sources + (compteur OU liste si sur Resultats) |
| Clic ▶ Play | apres 3s |
| Creer/editer source | apres save |
| Approve/reject | apres action |
| Onglet inactif (autre fenetre) | polling pause |
