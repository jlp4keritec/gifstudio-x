# GifStudio-X — Etape 10.3.1 : Rule34 auth credentials

## Contenu

- Rule34 requiert depuis aout 2025 une authentification `api_key` + `user_id`
- Credentials dans `.env` (pas en BDD)
- Adapter modifie : passe `api_key` + `user_id` dans les query params
- Erreur explicite si credentials manquants

## Fichiers

- `apps/api/src/config/env.ts` *(maj)* — ajout `RULE34_API_KEY` + `RULE34_USER_ID` optionnels
- `apps/api/src/services/crawler/adapters/rule34-adapter.ts` *(maj)* — auth injectee

## Procedure

### 1. Decompresser (ecraser)

### 2. Ajouter dans `C:\gifstudio-x\.env`

```env
RULE34_API_KEY=TA_NOUVELLE_CLE_ICI
RULE34_USER_ID=6150546
```

(pas de guillemets, pas d'espaces)

### 3. Relancer l'API

Le `.env` n'est charge qu'au demarrage, donc :

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

## Test

1. http://localhost:3003/admin/crawler
2. Ta source Rule34 existante (ou nouvelle) :
   ```json
   {
     "includeTags": ["video"],
     "excludeTags": ["loli", "shota"],
     "sort": "score",
     "minScore": 20
   }
   ```
3. ▶ Play → attendre 5s → Rafraichir
4. "Dernier run" doit afficher `success` avec "X nouveau(x) / 20 trouve(s)"
5. Onglet Resultats : les videos apparaissent avec leurs thumbnails

## Debug

### "Credentials Rule34 manquants"
Les variables `RULE34_API_KEY` ou `RULE34_USER_ID` ne sont pas lues. Verifier :
- Fichier .env bien a la racine `C:\gifstudio-x\.env`
- Pas de guillemets autour des valeurs
- Node bien redemarre apres ajout

### "Rule34 HTTP 401/403"
Credentials invalides. Retourner sur https://rule34.xxx/index.php?page=account&s=options
pour verifier la cle (ou en regenerer une).

### 0 resultats malgre success
Tags trop restrictifs. Tester dans le navigateur avec les memes tags :
https://rule34.xxx/index.php?page=post&s=list&tags=video

## Securite

Les credentials sont dans `.env` qui est gitignore (jamais commit). Si tu deploies sur VPS, il faudra les redefinir dans le `.env` du serveur.
