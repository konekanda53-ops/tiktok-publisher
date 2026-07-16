/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — server.js
   Serveur Express + SSE pour la progression
═══════════════════════════════════════ */

require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { genererContenu }  = require('./src/ia');
const { genererVoix }     = require('./src/ttsManager');
const { obtenirImages }   = require('./src/pexels');
const { genererSRT }      = require('./src/subtitle');
const { creerVideo }      = require('./src/video');
const { publierVideo, verifierConnexion } = require('./src/tiktok');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ──────────────────────── */
app.use(express.json());
app.use(express.static('public'));

/* ── SSE : envoyer la progression ───── */
const clients = new Map(); // sessionId → res

function envoyerProgression(sessionId, etape, message, data = {}) {
  const client = clients.get(sessionId);
  if (!client) return;

  const payload = JSON.stringify({ etape, message, ...data });
  client.write(`data: ${payload}\n\n`);
  console.log(`[${sessionId}] [${etape}] ${message}`);
}

/* ── Route : connexion SSE ───────────── */
app.get('/api/progression/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  clients.set(sessionId, res);
  console.log(`[SSE] Client connecté : ${sessionId}`);

  req.on('close', () => {
    clients.delete(sessionId);
    console.log(`[SSE] Client déconnecté : ${sessionId}`);
  });

  // Garder la connexion vivante
  const heartbeat = setInterval(() => {
    if (!clients.has(sessionId)) { clearInterval(heartbeat); return; }
    res.write(': heartbeat\n\n');
  }, 25000);
});

/* ── Route principale : générer une vidéo ── */
app.post('/api/generer', async (req, res) => {
  const {
    sujet,
    duree       = 60,
    langue      = 'fr-FR',
    style       = 'informatif',
    publier     = false,
    sessionId   = `session_${Date.now()}`
  } = req.body;

  if (!sujet) {
    return res.status(400).json({ success: false, erreur: 'Le sujet est requis' });
  }

  // Répondre immédiatement avec l'ID de session
  res.json({ success: true, sessionId, message: 'Génération démarrée...' });

  // Traitement asynchrone
  try {
    const TMP_DIR = process.env.TMP_DIR || './tmp';
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // ═══ ÉTAPE 1 : Génération du contenu IA ═══
    envoyerProgression(sessionId, 'ia', 'Génération du script avec Gemini...', { pct: 5 });
    const contenu = await genererContenu({ sujet, duree, langue: langue.slice(0, 2), style });
    envoyerProgression(sessionId, 'ia_ok', 'Script généré !', {
      pct: 20,
      titre:        contenu.titre,
      script:       contenu.script,
      description:  contenu.description,
      hashtags:     contenu.hashtags
    });

    // ═══ ÉTAPE 2 : Génération de la voix ═══
    envoyerProgression(sessionId, 'voix', 'Génération de la voix...', { pct: 30 });
    const voixResult = await genererVoix({
      texte:      contenu.script,
      langue,
      voix:       process.env.TTS_VOIX || null,  // null = voix par défaut selon la langue
      outputPath: path.join(TMP_DIR, `voix_${sessionId}.wav`)
    });
    envoyerProgression(sessionId, 'voix_ok', `Voix générée (${voixResult.duree}s)`, { pct: 45 });

    // ═══ ÉTAPE 3 : Récupération des images ═══
    envoyerProgression(sessionId, 'images', 'Téléchargement des images Pexels...', { pct: 50 });
    const images = await obtenirImages({
      keywords:    contenu.visual_keywords,
      nbImages:    Math.max(3, Math.ceil(duree / 10)),
      orientation: 'portrait'
    });
    envoyerProgression(sessionId, 'images_ok', `${images.length} image(s) téléchargée(s)`, { pct: 65 });

    // ═══ ÉTAPE 4 : Sous-titres ═══
    envoyerProgression(sessionId, 'subs', 'Génération des sous-titres...', { pct: 70 });
    const subsResult = genererSRT({
      script:     contenu.script,
      dureeAudio: voixResult.duree,
      outputPath: path.join(TMP_DIR, `subs_${sessionId}.srt`)
    });
    envoyerProgression(sessionId, 'subs_ok', `${subsResult.nbSegments} sous-titres créés`, { pct: 75 });

    // ═══ ÉTAPE 5 : Montage vidéo ═══
    envoyerProgression(sessionId, 'video', 'Montage de la vidéo avec FFmpeg...', { pct: 80 });
    const videoResult = await creerVideo({
      images:            images,
      voixFichier:       voixResult.fichier,
      sousTitresFichier: subsResult.fichier,
      dureeAudio:        voixResult.duree,
      titre:             contenu.titre
    });
    console.log("===== IMAGES =====");

images.forEach((img, i) => {
    console.log(i + 1, img.fichier);

    if (fs.existsSync(img.fichier)) {
        console.log("OK");
    } else {
        console.log("ABSENTE");
    }
});

console.log("==================");
    envoyerProgression(sessionId, 'video_ok', 'Vidéo montée !', {
      pct:     publier ? 85 : 100,
      fichier: `/output/${path.basename(videoResult.fichier)}`,
      taille:  videoResult.taille
    });

    // ═══ ÉTAPE 6 : Publication TikTok (optionnel) ═══
    if (publier) {
      envoyerProgression(sessionId, 'tiktok', 'Publication sur TikTok...', { pct: 90 });
      const tiktokResult = await publierVideo({
        fichierVideo: videoResult.fichier,
        titre:        contenu.titre,
        description:  contenu.description,
        hashtags:     contenu.hashtags,
        modePublic:   false // brouillon par défaut
      });
      envoyerProgression(sessionId, 'tiktok_ok', 'Publié sur TikTok !', {
        pct:       100,
        publishId: tiktokResult.publishId,
        lien:      tiktokResult.lien
      });
    }

    // ═══ TERMINÉ ═══
    envoyerProgression(sessionId, 'termine', 'Vidéo prête !', { pct: 100 });

  } catch (err) {
    console.error(`[Erreur] ${sessionId} :`, err.message);
    envoyerProgression(sessionId, 'erreur', err.message, { pct: 0 });
  }
});

/* ── Route : voix disponibles ────────── */
app.get('/api/voix', (req, res) => {
  const { listerVoix } = require('./src/ttsManager');
  res.json({ voix: listerVoix(), modele: 'gemini-2.5-flash-preview-tts' });
});

/* ── Route : status TikTok ───────────── */
app.get('/api/tiktok/status', async (req, res) => {
  const statut = await verifierConnexion();
  res.json(statut);
});

/* ── Route : liste des vidéos générées ── */
app.get('/api/videos', (req, res) => {
  const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const fichiers = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const stats = fs.statSync(path.join(OUTPUT_DIR, f));
      return {
        nom:     f,
        url:     `/output/${f}`,
        taille:  stats.size,
        date:    stats.mtime
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ videos: fichiers });
});

/* ── Servir les vidéos générées ──────── */
app.use('/output', express.static(process.env.OUTPUT_DIR || './output'));

/* ── Page d'accueil ──────────────────── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Démarrage ───────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🎬 TikTok IA Studio V2`);
  console.log(`🚀 Serveur : http://localhost:${PORT}`);
  console.log(`📂 Vidéos  : ${path.resolve(process.env.OUTPUT_DIR || './output')}`);
  console.log(`📁 Temp    : ${path.resolve(process.env.TMP_DIR || './tmp')}\n`);
});

module.exports = app;
