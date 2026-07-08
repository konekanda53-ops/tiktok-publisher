# TikTok IA Studio — script, voix, images et vidéo générés par l'IA

Backend Node.js/Express qui gère la connexion OAuth2 d'un compte TikTok et
génère automatiquement, via l'API Gemini : le script, la voix, les images et
le montage vidéo — avant envoi en **brouillon** dans l'app TikTok de
l'utilisateur (scope `video.upload`).

## Ce qui a changé dans cette version

Avant, le bouton "Envoyer vers TikTok" attendait qu'un fichier MP4 existe déjà
— rien ne le créait. Trois modules ont été ajoutés pour combler ce vide :

| Fichier | Rôle |
|---|---|
| `voice.js` | Transforme le script en voix via le TTS natif Gemini (`gemini-3.1-flash-tts-preview`), avec la même clé `GEMINI_API_KEY` que le reste |
| `image.js` | Découpe le script en quelques scènes et génère une illustration par scène (`gemini-3.1-flash-image-preview`) |
| `video.js` | Assemble images + voix en un MP4 vertical (1080×1920) via `ffmpeg` (bundlé, aucune installation système requise) |

Nouvelles routes dans `server.js` :
- `POST /api/generate-voice` — génère un aperçu audio (WAV) à partir d'un texte
- `POST /api/create-video` — pipeline complet : voix + images + montage → renvoie un `videoId`
- `GET /api/video/:id` — prévisualise / télécharge une vidéo générée
- `POST /api/publish` — accepte maintenant soit un fichier uploadé, soit `{ videoId }` d'une vidéo générée par l'IA (l'utilisateur n'a plus besoin de choisir un fichier pour ce cas)

Nouveau workflow dans le tableau de bord (`/app/`) :
Sujet → **Script IA** (existant) → **Voix** (aperçu audio) → **Vidéo** (génère
tout automatiquement) → **Publication** (envoi en brouillon TikTok).

## ⚠️ Limites connues de cette première version

- **Pas de sous-titres incrustés.** L'assemblage vidéo actuel est volontairement
  simple (images + voix uniquement) pour rester dans un temps de traitement
  raisonnable. L'ajout de sous-titres synchronisés est une prochaine étape.
- **Stockage des vidéos en mémoire, purgé après 20 minutes.** Comme pour les
  comptes connectés, un redémarrage du serveur fait perdre les vidéos en attente.
- **Consommation mémoire/CPU.** `ffmpeg-static` embarque un binaire (~80 Mo) et
  l'encodage vidéo est gourmand en CPU. Sur l'offre gratuite de Render (RAM et
  CPU limités), un montage peut être lent ou échouer sur des scripts longs.
  Teste d'abord en local (`npm run dev`) ; commence avec des scripts courts
  (30 s, 3-4 images) avant de pousser vers des formats plus longs.
- **Modèles "preview".** `gemini-3.1-flash-tts-preview` et
  `gemini-3.1-flash-image-preview` sont des modèles en aperçu chez Google :
  leur disponibilité ou leur nom peuvent changer. Si une génération échoue
  avec une erreur de modèle inconnu, vérifie sur https://ai.google.dev les
  noms de modèles TTS/image actuellement disponibles pour ta clé.

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
# remplis .env avec ta Client Key, ton Client Secret, ta clé Gemini, etc.
npm start
```

Variables d'environnement nécessaires (noms exacts) :
`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`,
`GEMINI_API_KEY`. Un nom différent fait échouer silencieusement la
fonctionnalité concernée (c'est ce qui s'est passé avec `API_KEY` au lieu de
`ANTHROPIC_API_KEY` dans une version précédente).

## 3. Structure du site

```
server.js, auth.js, publish.js, ia.js, voice.js, image.js, video.js

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
- `http://localhost:3000/app/` → le studio (connexion, script, voix, vidéo, publication)
- `http://localhost:3000/privacy` et `/terms` → redirigent vers les pages légales

## 4. Utiliser le studio de bout en bout

1. Onglet **Connexion** : connecte ton compte TikTok.
2. Onglet **Script IA** : choisis une catégorie, génère le script.
3. Onglet **Voix** (facultatif) : écoute un aperçu de la narration.
4. Onglet **Vidéo** : clique sur "Générer la vidéo (voix + images)", patiente,
   prévisualise, puis "Envoyer cette vidéo vers TikTok".
5. Ouvre l'app TikTok pour publier le brouillon reçu.

L'onglet **Publication** reste disponible pour envoyer manuellement un fichier
MP4 existant, indépendamment du pipeline IA.

## 5. Pour ton dossier d'audit TikTok

Le formulaire de review demande une vidéo de démo montrant le flux complet.
Assure-toi que :
- seuls les scopes réellement utilisés (`user.info.basic`, `video.upload`)
  sont cochés ;
- les URLs "Terms of Service" et "Privacy Policy" pointent vers des pages
  publiquement accessibles (`/terms` et `/privacy`, ou directement les fichiers
  `.html`) — teste-les en navigation privée avant de soumettre.

## Prochaines briques possibles

- Sous-titres incrustés (nécessite d'aligner le texte sur l'audio généré).
- Musique de fond libre de droits mixée sous la narration.
- Remplacer le stockage en mémoire (comptes + vidéos) par une vraie base de
  données, pour survivre aux redéploiements Render.
- Publication 100 % automatique et publique (scope `video.publish` + Direct
  Post + domaine vérifié) — actuellement en mode brouillon volontairement.
- Calendrier de publication, statistiques — inchangé, voir le tableau de bord.
