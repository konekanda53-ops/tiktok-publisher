import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
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

const {
  TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI,
  PORT = 3000,
} = process.env;

// Accepte ANTHROPIC_API_KEY (nom recommandé) ou API_KEY (au cas où la
// variable a été créée sous ce nom, par exemple sur Render).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.API_KEY;

if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
  console.warn("⚠️  TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants : copie .env.example en .env et remplis-le.");
}
if (!ANTHROPIC_API_KEY) {
  console.warn("⚠️  Clé API Anthropic manquante : ajoute ANTHROPIC_API_KEY (ou API_KEY) dans tes variables d'environnement.");
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
// Tolérant aux échecs : le scope "video.upload" seul ne garantit pas
// forcément l'accès à toutes les infos ; on dégrade proprement plutôt que
// de casser l'interface.
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

// 4) Envoyer une vidéo vers TikTok en brouillon (multipart/form-data : champ
// "video" + champ "openId"). L'utilisateur finalise la publication depuis
// l'app TikTok — aucun domaine à vérifier, aucun niveau de confidentialité
// à choisir ici.
app.post("/api/publish", upload.single("video"), async (req, res) => {
  const { openId } = req.body;
  const fichier = req.file;

  try {
    if (!fichier) {
      return res.status(400).json({ erreur: "Aucun fichier vidéo reçu." });
    }

    const accessToken = await obtenirTokenValide(openId);

    const { publish_id, upload_url } = await initierBrouillonParFichier({
      accessToken,
      tailleOctets: fichier.buffer.length,
    });

    await envoyerFichierVersTikTok({ uploadUrl: upload_url, buffer: fichier.buffer });

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
      apiKey: ANTHROPIC_API_KEY,
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
