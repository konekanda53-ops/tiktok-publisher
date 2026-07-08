import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import {
  genererPKCE,
  genererState,
  construireUrlAutorisation,
  echangerCodeContreToken,
  rafraichirToken,
} from "./auth.js";
import {
  recupererInfosCreateur,
  initierBrouillonParFichier,
  envoyerFichierVersTikTok,
  verifierStatutPublication,
} from "./publish.js";
import { genererContenuIA } from "./ia.js";
import { genererVoix, envelopperEnWav } from "./voice.js";
import { genererImagesPourScript } from "./image.js";
import { assemblerVideo } from "./video.js";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "public")));

// Upload en mémoire (pas d'écriture sur disque) : suffisant pour des vidéos
// courtes de type TikTok. Limite fixée à 150 Mo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

// --- Stockage temporaire en mémoire (à remplacer par une vraie base de
// données / un vault de secrets avant toute mise en production) ---
const sessionsPKCE = new Map(); // state -> { verifier }
const comptes = new Map(); // open_id -> { accessToken, refreshToken, expiresAt }

// Vidéos générées automatiquement, en attente d'être envoyées vers TikTok ou
// prévisualisées. Purgées après 20 minutes pour ne pas saturer la mémoire du
// serveur (important sur un hébergeur à mémoire limitée comme Render free).
const videosGenerees = new Map(); // videoId -> { buffer, creeLe }
const DUREE_DE_VIE_VIDEO_MS = 20 * 60 * 1000;
setInterval(() => {
  const maintenant = Date.now();
  for (const [id, entree] of videosGenerees) {
    if (maintenant - entree.creeLe > DUREE_DE_VIE_VIDEO_MS) videosGenerees.delete(id);
  }
}, 5 * 60 * 1000);

const {
  TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI,
  GEMINI_API_KEY,
  PORT = 3000,
} = process.env;

if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
  console.warn("⚠️  TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants : copie .env.example en .env et remplis-le.");
}
if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY manquante : ajoute-la dans tes variables d'environnement.");
}

// 1) L'utilisateur clique sur "Connecter mon compte TikTok"
app.get("/auth/tiktok/start", (req, res) => {
  const { verifier, challenge } = genererPKCE();
  const state = genererState();
  sessionsPKCE.set(state, { verifier, creeLe: Date.now() });

  const url = construireUrlAutorisation({
    clientKey: TIKTOK_CLIENT_KEY,
    redirectUri: TIKTOK_REDIRECT_URI,
    state,
    codeChallenge: challenge,
  });

  res.redirect(url);
});

// 2) TikTok redirige ici après autorisation par le créateur
app.get("/auth/tiktok/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Autorisation refusée : ${error_description || error}`);
  }

  const session = sessionsPKCE.get(state);
  if (!session) {
    return res.status(400).send("State invalide ou expiré, recommence la connexion.");
  }
  sessionsPKCE.delete(state);

  try {
    const token = await echangerCodeContreToken({
      clientKey: TIKTOK_CLIENT_KEY,
      clientSecret: TIKTOK_CLIENT_SECRET,
      code,
      redirectUri: TIKTOK_REDIRECT_URI,
      codeVerifier: session.verifier,
    });

    comptes.set(token.open_id, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });

    res.redirect(`/app/?openId=${encodeURIComponent(token.open_id)}`);
  } catch (e) {
    res.status(500).send(`Erreur lors de l'échange du token : ${e.message}`);
  }
});

// Récupère un token valide pour un compte, en le rafraîchissant si besoin
async function obtenirTokenValide(openId) {
  const compte = comptes.get(openId);
  if (!compte) throw new Error("Ce compte n'est pas connecté. Lance /auth/tiktok/start d'abord.");

  if (Date.now() > compte.expiresAt - 60_000) {
    const refresh = await rafraichirToken({
      clientKey: TIKTOK_CLIENT_KEY,
      clientSecret: TIKTOK_CLIENT_SECRET,
      refreshToken: compte.refreshToken,
    });
    compte.accessToken = refresh.access_token;
    compte.refreshToken = refresh.refresh_token;
    compte.expiresAt = Date.now() + refresh.expires_in * 1000;
  }

  return compte.accessToken;
}

// 3) Infos du créateur, pour affichage (pseudo, avatar...).
app.get("/api/creator-info", async (req, res) => {
  try {
    const accessToken = await obtenirTokenValide(req.query.openId);
    try {
      const infos = await recupererInfosCreateur(accessToken);
      res.json({ ...infos, degrade: false });
    } catch (e) {
      res.json({ degrade: true, erreur: e.message });
    }
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 4) Envoyer une vidéo vers TikTok en brouillon.
// Deux sources possibles :
//  - un fichier uploadé manuellement (multipart, champ "video") ;
//  - une vidéo déjà générée par l'IA (champ "videoId", voir /api/create-video).
app.post("/api/publish", upload.single("video"), async (req, res) => {
  const { openId, videoId } = req.body;

  try {
    let buffer;
    if (req.file) {
      buffer = req.file.buffer;
    } else if (videoId) {
      const entree = videosGenerees.get(videoId);
      if (!entree) return res.status(400).json({ erreur: "Vidéo introuvable ou expirée, régénère-la." });
      buffer = entree.buffer;
    } else {
      return res.status(400).json({ erreur: "Aucun fichier vidéo ni vidéo générée reçue." });
    }

    const accessToken = await obtenirTokenValide(openId);

    const { publish_id, upload_url } = await initierBrouillonParFichier({
      accessToken,
      tailleOctets: buffer.length,
    });

    await envoyerFichierVersTikTok({ uploadUrl: upload_url, buffer });

    res.json({ publishId: publish_id });
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 5) Suivre le statut d'un envoi en cours
app.get("/api/publish/status", async (req, res) => {
  const { openId, publishId } = req.query;
  try {
    const accessToken = await obtenirTokenValide(openId);
    const statut = await verifierStatutPublication({ accessToken, publishId });
    res.json(statut);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 6) Générer un contenu (idée, script, titre, SEO, hashtags) avec l'IA
app.post("/api/generate-script", async (req, res) => {
  const { categorie, sujet, duree, langue } = req.body;
  try {
    const contenu = await genererContenuIA({
      apiKey: GEMINI_API_KEY,
      categorie,
      sujet,
      duree,
      langue,
    });
    res.json(contenu);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 7) Générer uniquement la voix (aperçu audio) à partir d'un texte.
// Renvoie un WAV jouable directement dans un <audio> de navigateur.
app.post("/api/generate-voice", async (req, res) => {
  const { texte } = req.body;
  try {
    const pcm = await genererVoix({ apiKey: GEMINI_API_KEY, texte });
    const wav = envelopperEnWav(pcm);
    res.set("Content-Type", "audio/wav");
    res.send(wav);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 8) Pipeline complet : script → voix → images → montage ffmpeg → vidéo.
// L'utilisateur ne choisit aucun fichier ici : tout est généré. Peut prendre
// 30 secondes à 2 minutes selon la longueur du script et le nombre d'images.
app.post("/api/create-video", async (req, res) => {
  const { idee, script } = req.body;
  try {
    if (!script || !script.trim()) {
      return res.status(400).json({ erreur: "Aucun script fourni. Génère d'abord un script." });
    }

    const audioPcm = await genererVoix({ apiKey: GEMINI_API_KEY, texte: script });
    const images = await genererImagesPourScript({
      apiKey: GEMINI_API_KEY,
      idee: idee || script.slice(0, 80),
      script,
      nombreImages: 4,
    });
    const videoBuffer = await assemblerVideo({ images, audioPcm });

    const videoId = nanoid();
    videosGenerees.set(videoId, { buffer: videoBuffer, creeLe: Date.now() });

    res.json({ videoId });
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
});

// 9) Prévisualiser / télécharger une vidéo générée par l'IA
app.get("/api/video/:id", (req, res) => {
  const entree = videosGenerees.get(req.params.id);
  if (!entree) return res.status(404).json({ erreur: "Vidéo introuvable ou expirée." });
  res.set("Content-Type", "video/mp4");
  res.send(entree.buffer);
});

// Redirections courtes vers les vraies pages légales (public/*.html)
app.get("/privacy", (req, res) => res.redirect("/politique-confidentialite.html"));
app.get("/terms", (req, res) => res.redirect("/conditions-utilisation.html"));

// Filet de sécurité pour les erreurs multer (fichier trop gros, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ erreur: `Erreur d'envoi de fichier : ${err.message}` });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`✅ Serveur prêt sur http://localhost:${PORT}`);
  console.log(`   Connecte un compte TikTok ici : http://localhost:${PORT}/auth/tiktok/start`);
});
