import "dotenv/config";
import express from "express";
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
  publierVideoDepuisUrl,
  verifierStatutPublication,
} from "./publish.js";
import { genererContenuIA } from "./ia.js";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "public")));

// --- Stockage temporaire en mémoire (à remplacer par une vraie base de
// données / un vault de secrets avant toute mise en production) ---
const sessionsPKCE = new Map(); // state -> { verifier }
const comptes = new Map(); // open_id -> { accessToken, refreshToken, expiresAt }

const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, ANTHROPIC_API_KEY, PORT = 3000 } = process.env;

if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
  console.warn("⚠️  TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants : copie .env.example en .env et remplis-le.");
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

// 3) Infos du créateur (à appeler juste avant chaque publication)
app.get("/api/creator-info", async (req, res) => {
  try {
    const accessToken = await obtenirTokenValide(req.query.openId);
    const infos = await recupererInfosCreateur(accessToken);
    res.json(infos);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 4) Publier une vidéo
// Body attendu : { openId, videoUrl, titre, privacyLevel }
// videoUrl doit être hébergée sur un domaine VÉRIFIÉ dans le portail TikTok.
app.post("/api/publish", async (req, res) => {
  const {
    openId,
    videoUrl,
    titre,
    privacyLevel,
    desactiverCommentaire,
    desactiverDuet,
    desactiverStitch,
  } = req.body;
  try {
    const accessToken = await obtenirTokenValide(openId);

    // Vérification obligatoire des options autorisées avant de publier
    const infos = await recupererInfosCreateur(accessToken);
    const niveau = privacyLevel || infos.privacy_level_options[0];
    if (!infos.privacy_level_options.includes(niveau)) {
      return res.status(400).json({ erreur: `privacyLevel invalide. Options autorisées : ${infos.privacy_level_options.join(", ")}` });
    }

    const { publish_id } = await publierVideoDepuisUrl({
      accessToken,
      videoUrl,
      titre,
      privacyLevel: niveau,
      desactiverCommentaire: Boolean(desactiverCommentaire),
      desactiverDuet: Boolean(desactiverDuet),
      desactiverStitch: Boolean(desactiverStitch),
    });

    res.json({ publishId: publish_id, niveauConfidentialite: niveau });
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// 5) Suivre le statut d'une publication en cours
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

app.listen(PORT, () => {
  console.log(`✅ Serveur prêt sur http://localhost:${PORT}`);
  console.log(`   Connecte un compte TikTok ici : http://localhost:${PORT}/auth/tiktok/start`);
});
