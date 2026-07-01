# TikTok Publisher — backend de publication automatique

Backend Node.js/Express qui gère la connexion OAuth2 d'un compte TikTok et la
publication automatique de vidéos via la **Content Posting API** officielle.

## 1. Créer ton app sur TikTok for Developers

1. Va sur https://developers.tiktok.com/apps et crée une app.
2. Dans les paramètres de l'app, ajoute le **Content Posting API** et active
   **Direct Post**.
3. Ajoute l'URL de redirection : `http://localhost:3000/auth/tiktok/callback`
   (à remplacer par ton domaine réel en production).
4. Demande les scopes `user.info.basic` et `video.publish`.
5. Récupère ta **Client Key** et ton **Client Secret**.

⚠️ Si tu veux publier des vidéos via une URL (`PULL_FROM_URL`, ce que fait ce
backend), TikTok exige aussi que tu **vérifies la propriété du domaine** qui
héberge tes vidéos, dans la section "Domain Verification" du portail.

## 2. Installer et configurer

```bash
npm install
cp .env.example .env
# remplis .env avec ta Client Key, ton Client Secret, etc.
npm start
```

## 3. Structure du site

```
public/
├── index.html                    → page d'accueil (site vitrine)
├── conditions-utilisation.html   → CGU (modèle à faire relire par un juriste)
├── politique-confidentialite.html→ politique de confidentialité (idem)
├── assets/
│   ├── site.css                  → styles du site vitrine
│   └── site.js                   → motif "bogolan" (signature visuelle)
└── app/
    ├── index.html                → le tableau de bord (l'application)
    ├── style.css
    └── script.js
```

- `http://localhost:3000/` → site vitrine (présentation, CGU, confidentialité)
- `http://localhost:3000/app/` → le studio (connexion, script IA, publication)

Le bouton "Ouvrir le studio" sur le site vitrine mène vers `/app/`. Après
connexion TikTok, tu es redirigé vers `/app/?openId=...`.

⚠️ Les pages CGU et Politique de confidentialité sont des **modèles** avec des
passages `[à préciser]` : à compléter et faire relire par un juriste avant
toute mise en ligne réelle, en particulier pour la conformité RGPD et les
exigences de TikTok sur le traitement des données de compte.

## 4. Connecter un compte TikTok et utiliser le tableau de bord

Le bouton "Connecter mon compte TikTok" (dans `/app/`) t'envoie vers
`/auth/tiktok/start`. Une fois autorisé, tu es redirigé vers le tableau de
bord avec ton compte connecté (l'`openId` est conservé dans le `localStorage`
de ton navigateur).

## 5. Publier une vidéo (en ligne de commande, optionnel)

Tu peux aussi publier directement en `curl`, sans passer par la page web :

```bash
curl -X POST http://localhost:3000/api/publish \
  -H "Content-Type: application/json" \
  -d '{
    "openId": "TON_OPEN_ID",
    "videoUrl": "https://ton-domaine-verifie.com/videos/mansa-moussa.mp4",
    "titre": "Le roi le plus riche de l'\''histoire 😳 #histoire #afrique",
    "privacyLevel": "SELF_ONLY"
  }'
```

Puis suis le statut :

```bash
curl "http://localhost:3000/api/publish/status?openId=TON_OPEN_ID&publishId=ID_RENVOYE"
```

## 5. Ce que tu dois savoir avant de viser la production

| Contrainte | Détail |
|---|---|
| **Audit obligatoire** | Tant qu'il n'est pas passé, toute vidéo publiée est en `SELF_ONLY` (visible que par toi). Le dossier d'audit prend 2 à 6 semaines. |
| **Limite avant audit** | 5 comptes autorisés max par tranche de 24h. |
| **Quota après audit** | ~15 à 25 vidéos/jour/compte. |
| **Domaine vérifié** | Obligatoire pour publier via URL. |
| **UX imposée par TikTok** | Avant de publier, ton app doit afficher le pseudo/avatar du créateur, proposer les bonnes options de confidentialité, et obtenir un consentement explicite — c'est déjà géré par `creator-info` et par le flux ci-dessus, mais l'interface finale devra l'afficher visuellement avant de publier. |
| **Pas de marque déposée sur le contenu** | TikTok interdit les watermarks/logos promotionnels ajoutés automatiquement. |

## 6. Pour préparer ton dossier d'audit

TikTok demandera une démo fonctionnelle de bout en bout. Le plus rapide :
1. Connecte ton propre compte TikTok ici en local.
2. Publie 2-3 vidéos de test en `SELF_ONLY`.
3. Fais une courte vidéo/captures d'écran montrant le flux complet (connexion
   → génération de contenu → publication → confirmation).
4. Soumets l'audit depuis le portail développeur avec cette démo.

## Prochaines briques à connecter

- ✅ Génération de script IA (déjà branchée, onglet "Script IA")
- Remplacer le stockage en mémoire (`Map`) par une vraie base de données
  (PostgreSQL/MongoDB) pour ne pas perdre les comptes connectés au redémarrage.
- Voix IA : brancher un service de synthèse vocale (ElevenLabs, OpenAI TTS) sur
  le champ `script` généré, via une nouvelle route serveur.
- Vidéo : pipeline de montage (TTS + images + ffmpeg) qui produit le fichier
  final à héberger sur ton domaine vérifié avant publication.
- Statistiques : nécessite le scope `video.list` / `research.data.basic` de
  l'API TikTok, soumis au même processus d'audit que la publication.
