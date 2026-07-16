# 🎬 TikTok IA Studio V2

Génération automatique de vidéos TikTok avec IA.

---

## Installation

```bash
# 1. Cloner / copier le projet
cd tiktok-ia-studio-v2

# 2. Installer les dépendances
npm install

# 3. Configurer les clés API
cp .env.example .env
# Éditer .env avec vos vraies clés

# 4. Installer FFmpeg (si pas encore fait)
# Ubuntu/Debian :
sudo apt install ffmpeg
# macOS :
brew install ffmpeg

# 5. Lancer le serveur
npm start
# ou en développement :
npm run dev

# 6. Ouvrir dans le navigateur
# http://localhost:3000
```

---

## Clés API nécessaires

| Service | Variable | Où l'obtenir |
|---------|----------|--------------|
| Google Gemini (script + voix) | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| Pexels | `PEXELS_API_KEY` | [pexels.com/api](https://www.pexels.com/api/) |
| TikTok | `TIKTOK_*` | [developers.tiktok.com](https://developers.tiktok.com) |

> ✅ **Une seule clé Gemini** pour le script IA **et** la voix TTS.
> Google Cloud TTS n'est plus utilisé.

## Pipeline complet

```
Gemini 1.5 Flash  →  Script, titre, hashtags, mots-clés
Gemini 2.5 TTS    →  Voix audio (.wav)
Pexels            →  Images HD
FFmpeg            →  Montage vidéo 1080×1920
TikTok API        →  Publication (brouillon)
```

## Voix Gemini disponibles

| Voix | Genre | Caractère |
|------|-------|-----------|
| **Aoede** *(défaut fr-FR)* | Féminin | Douce, narrative |
| Kore | Féminin | Claire, professionnelle |
| Zephyr | Féminin | Légère, moderne |
| Leda | Féminin | Chaleureuse |
| Charon | Masculin | Grave, posé |
| Fenrir | Masculin | Dynamique, énergique |
| Puck | Masculin | Vif, expressif |
| **Orbit** *(défaut en-US)* | Masculin | Neutre, informatif |

Configurable via `TTS_VOIX=Charon` dans le `.env`.

---

## Architecture

```
tiktok-ia-studio-v2/
├── server.js           → Serveur Express + SSE (progression)
├── src/
│   ├── ia.js           → Gemini (JSON garanti, jamais d'undefined)
│   ├── ttsManager.js   → Google TTS avec retry automatique
│   ├── pexels.js       → Images HD avec cache et déduplication
│   ├── subtitle.js     → Génération sous-titres SRT
│   ├── video.js        → Montage FFmpeg (format TikTok 9:16)
│   └── tiktok.js       → Publication TikTok API
├── public/
│   ├── index.html      → Interface utilisateur
│   ├── css/style.css   → Styles
│   └── js/app.js       → Frontend (SSE, progression, sans undefined)
├── tmp/                → Fichiers temporaires (voix, images, subs)
├── output/             → Vidéos finales MP4
├── .env.example        → Modèle de configuration
└── package.json
```

---

## Fonctionnement

1. L'utilisateur saisit un sujet et clique sur **Générer**
2. Le serveur génère un `sessionId` et ouvre un canal SSE
3. Les 5 étapes s'exécutent en séquence :
   - **Script IA** → Gemini génère titre, script, hashtags, mots-clés visuels
   - **Voix** → Google TTS convertit le script en MP3 (avec retry si quota)
   - **Images** → Pexels télécharge des images HD correspondantes
   - **Sous-titres** → Génération du fichier SRT synchronisé
   - **Montage** → FFmpeg assemble la vidéo en format 1080×1920
4. La vidéo est disponible en téléchargement
5. (Optionnel) Publication automatique sur TikTok en brouillon

---

## Format vidéo TikTok

- Résolution : **1080 × 1920** (portrait 9:16)
- FPS : **30**
- Codec : **H.264 / AAC**
- Sous-titres : style blanc avec contour noir, centrés en bas

---

## Gestion des erreurs

| Erreur | Comportement |
|--------|-------------|
| Gemini quota | Retourne une structure valide de fallback |
| TTS quota / 429 | Retry automatique × 3 (3s → 8s → 15s) |
| Pexels 0 résultat | Fallback sur "nature" |
| FFmpeg erreur | Message d'erreur précis dans la console |
| TikTok non configuré | La case "publier" est ignorée silencieusement |
