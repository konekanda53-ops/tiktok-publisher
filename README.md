# TikTok IA Studio — script, voix, images et vidéo générés par l'IA

Backend Node.js/Express qui gère la connexion OAuth2 d'un compte TikTok et
génère automatiquement, via l'API Gemini (texte + voix) et Pexels (images) :
le script, la voix, les images et le montage vidéo — avant envoi en
**brouillon** dans l'app TikTok de l'utilisateur (scope `video.upload`).

## Nouveau : sous-titres incrustés + effet Ken Burns

Le montage vidéo (`video.js`) ressemble maintenant au format TikTok
classique, sur le modèle d'une vidéo de référence fournie :
- **Sous-titres incrustés** — le script est découpé en courtes légendes
  (5 mots environ), affichées en gras blanc à contour noir, centrées dans le
  tiers inférieur. Le minutage est réparti au prorata de la longueur de
  chaque légende par rapport à la durée totale de l'audio (approximation
  raisonnable, pas un alignement vocal exact — voir `subtitles.js`).
- **Effet Ken Burns** — chaque image n'est plus figée : un zoom avant lent
  est appliqué (filtre `zoompan` de ffmpeg).
- Une police (`fonts/DejaVuSans-Bold.ttf`) est embarquée dans le projet pour
  que le rendu des sous-titres ne dépende pas d'une police système
  potentiellement absente sur le serveur de déploiement (licence permissive,
  voir `fonts/LICENSE_DEJAVU.txt`).

⚠️ **Point à vérifier après déploiement** : l'incrustation de sous-titres
nécessite que le binaire `ffmpeg-static` téléchargé inclue `libass`. La
plupart des builds le font, mais si `/api/create-video` échoue avec un
message mentionnant "subtitles" ou "no such filter", dis-le et on ajustera.

## Bugs corrigés dans cette version

| Symptôme | Cause | Correction |
|---|---|---|
| `texte.trim is not a function` sur `/api/generate-voice` | `ia.js` ne forçait aucun schéma JSON : pour certains scripts, Gemini renvoyait `script` sous une autre forme qu'une chaîne | `ia.js` force maintenant un schéma JSON strict (`responseSchema`) qui garantit que `script` est toujours une chaîne ; `voice.js` normalise aussi le texte par sécurité |
| Les scripts "3 min" échouaient à se générer | `maxOutputTokens` trop bas pour Gemini : la réponse JSON était tronquée en plein milieu | La limite de tokens s'adapte maintenant à la durée demandée (jusqu'à 4096 pour "3 min"), et un message clair apparaît si la réponse est quand même tronquée |
| `/api/create-video` → 500 | `image.js` (passé à Pexels) exige `PEXELS_API_KEY`, absente ; et une seule scène sans résultat faisait échouer tout le montage | Avertissement au démarrage si la clé manque ; repli en cascade (mot-clé → sujet général → requête universelle) au lieu d'un échec fatal ; messages d'erreur précisant l'étape en cause (voix / images / montage) |
| Images incohérentes avec l'histoire racontée | Les requêtes Pexels étaient construites à partir d'extraits de phrases narratives (ex. "Moussa et ses Frères"), qui ne correspondent à aucune photo réelle dans une banque généraliste | `ia.js` génère maintenant des `visual_keywords` génériques en anglais (ex. "ancient african market") spécialement conçus pour la recherche de photos, utilisés en priorité |
| `/api/publish` → 400 répétés | Le compte TikTok n'était pas connecté, mais le bouton "Envoyer vers TikTok" de l'onglet Vidéo tentait quand même l'envoi | Vérification côté client avant l'envoi, avec message clair si non connecté |
| `favicon.ico` → 404 dans la console | Aucune route définie | Route silencieuse ajoutée |

**Sur les images :** même corrigée, la génération par mots-clés reste une
recherche de **photos génériques réelles**, pas des illustrations sur mesure
— une banque de photos ne contiendra jamais d'image d'un personnage
historique précis. Si tu veux des illustrations vraiment sur mesure plutôt
que des photos génériques thématiquement cohérentes, il faudra passer par un
modèle de génération d'images IA (ex. Gemini image, si disponible pour ta
clé) plutôt que Pexels — dis-le si tu veux qu'on bascule dessus.

## Ce qui a changé precedemment


Avant, le bouton "Envoyer vers TikTok" attendait qu'un fichier MP4 existe déjà
— rien ne le créait. Trois modules ont été ajoutés pour combler ce vide :

| Fichier | Rôle |
|---|---|
| `voice.js` | Transforme le script en voix via le TTS natif Gemini (`gemini-3.1-flash-tts-preview`), avec la même clé `GEMINI_API_KEY` que le reste |
| `image.js` | Découpe le script en mots-clés visuels génériques et cherche une photo correspondante sur Pexels (`PEXELS_API_KEY`) |
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
`GEMINI_API_KEY`, `PEXELS_API_KEY`. Un nom différent fait échouer
silencieusement la fonctionnalité concernée.

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
