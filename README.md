# TikTok Publisher — envoi de vidéo en brouillon TikTok

Backend Node.js/Express qui gère la connexion OAuth2 d'un compte TikTok et
l'envoi de vidéos en **brouillon** dans l'app TikTok de l'utilisateur, via la
**Content Posting API** officielle (scope `video.upload`).

> Mode actuel : **brouillon**. La vidéo est envoyée dans l'app TikTok de
> l'utilisateur, qui la publie lui-même (choix du titre, de la confidentialité,
> etc. se fait dans l'app). Pas de vérification de domaine nécessaire.
> Pour une **publication 100 % automatique** (sans repasser par l'app TikTok),
> il faudra plus tard : le scope `video.publish`, activer "Direct Post" dans
> le portail TikTok, et vérifier un domaine. Dis-le si tu veux qu'on bascule
> dessus.

## Bugs corrigés dans cette version

| Bug | Cause | Correction |
|---|---|---|
| `POST /api/generate-script` → 400 | La variable était nommée `API_KEY` sur Render au lieu de `ANTHROPIC_API_KEY` | `server.js` accepte maintenant les deux noms, et un avertissement s'affiche dans les logs si aucune n'est trouvée |
| `console.log("TEST GITHUB")` en tête de fichier | Oubli de debug | Retiré |
| Scope `video.publish` demandé mais `video.upload` seul approuvé côté TikTok | Incohérence entre le code et l'app TikTok réellement configurée | Le code utilise maintenant `video.upload` et l'endpoint "brouillon" (`inbox/video/init`), cohérent avec ce qui est approuvé |
| `/api/publish` envoyait une URL vidéo (`PULL_FROM_URL`) | Nécessite un domaine vérifié, qu'on ne veut pas gérer pour l'instant | Remplacé par un envoi direct du fichier (`FILE_UPLOAD`), aucun domaine à vérifier |
| `/privacy` et `/terms` dupliquaient un contenu minimal | Pages statiques déjà plus complètes existaient dans `public/` | Ces routes redirigent maintenant vers `politique-confidentialite.html` et `conditions-utilisation.html` |

## 1. Créer ton app sur TikTok for Developers

1. Va sur https://developers.tiktok.com/apps et crée une app.
2. Ajoute le produit **Content Posting API** (pas besoin d'activer "Direct
   Post" pour le mode brouillon).
3. Ajoute l'URL de redirection : `http://localhost:3000/auth/tiktok/callback`
   en local, ou `https://ton-app.onrender.com/auth/tiktok/callback` en
   production.
4. Scopes à demander : `user.info.basic` et `video.upload`.
5. Récupère ta **Client Key** et ton **Client Secret**.

## 2. Installer et configurer

```bash
npm install
cp .env.example .env
# remplis .env avec ta Client Key, ton Client Secret, ta clé Anthropic, etc.
npm start
```

⚠️ Sur Render (ou tout autre hébergeur), les noms de variables
d'environnement doivent être **exactement** :
`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`,
`ANTHROPIC_API_KEY`. Un nom différent (ex. `API_KEY` tout court) fait échouer
silencieusement la fonctionnalité concernée.

## 3. Structure du site

```
public/
├── index.html                    → page d'accueil (site vitrine)
├── conditions-utilisation.html   → CGU (modèle à faire relire par un juriste)
├── politique-confidentialite.html→ politique de confidentialité (idem)
├── assets/
│   ├── site.css
│   └── site.js
└── app/
    ├── index.html                → le tableau de bord (l'application)
    ├── style.css
    └── script.js
```

- `http://localhost:3000/` → site vitrine
- `http://localhost:3000/app/` → le studio (connexion, script IA, envoi vidéo)
- `http://localhost:3000/privacy` et `/terms` → redirigent vers les pages légales

## 4. Connecter un compte TikTok et envoyer une vidéo

1. Dans `/app/`, clique sur "Connecter mon compte TikTok".
2. Une fois autorisé, tu es redirigé vers `/app/?openId=...` (l'`openId` est
   conservé dans le `localStorage` du navigateur).
3. Onglet "Publication" : choisis un fichier `.mp4`, clique sur "Envoyer vers
   TikTok". La vidéo est envoyée en brouillon ; ouvre l'app TikTok pour la
   publier définitivement.

## 5. Pour ton dossier d'audit TikTok

Le formulaire de review demande une vidéo de démo montrant le flux complet :
connexion → génération de script IA → envoi de la vidéo → confirmation dans
l'app TikTok. Assure-toi que :
- seuls les scopes réellement utilisés (`user.info.basic`, `video.upload`)
  sont cochés dans le formulaire ;
- l'URL "Terms of Service" pointe vers `https://ton-domaine/terms` (ou
  `/conditions-utilisation.html`) et "Privacy Policy" vers
  `https://ton-domaine/privacy` (ou `/politique-confidentialite.html`) ;
- ces deux URLs sont bien accessibles publiquement (teste-les dans un
  navigateur en navigation privée) avant de soumettre.

Si le formulaire TikTok affiche encore des erreurs (comme "This form has 3
errors"), ce sont généralement des champs obligatoires manquants : icône
d'app (1024×1024px), catégorie, ou URL non vérifiée. Envoie-moi le détail des
3 erreurs affichées si tu veux de l'aide précise dessus.

## Prochaines briques à connecter

- ✅ Génération de script IA
- ✅ Envoi de vidéo en brouillon TikTok (sans domaine à vérifier)
- Remplacer le stockage en mémoire (`Map`) par une vraie base de données,
  pour ne pas perdre les comptes connectés à chaque redéploiement Render.
- Publication 100 % automatique (scope `video.publish` + Direct Post +
  domaine vérifié) — à activer quand tu es prêt.
- Voix IA, génération vidéo, statistiques — inchangé, voir le tableau de bord.
