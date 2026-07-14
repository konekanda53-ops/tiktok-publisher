/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — ia.js
   Génération de contenu via Google Gemini
   Format JSON garanti — jamais d'undefined
═══════════════════════════════════════ */

const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/* ── Prompt système ──────────────────── */
const SYSTEM_PROMPT = `Tu es un expert en création de contenu viral pour TikTok.
Tu dois TOUJOURS répondre en JSON valide et rien d'autre.
Ne mets jamais de texte avant ou après le JSON.
Ne mets jamais de balises markdown comme \`\`\`json.
Réponds uniquement avec l'objet JSON demandé.`;

/* ── Schéma de réponse attendu ───────── */
const SCHEMA_EXEMPLE = {
  titre: "Titre accrocheur de la vidéo",
  script: "Texte complet du script narré, environ 150 mots pour 60 secondes",
  description: "Description TikTok avec emojis (max 150 caractères)",
  hashtags: ["#hashtag1", "#hashtag2", "#hashtag3"],
  visual_keywords: ["mot-clé visuel 1", "mot-clé visuel 2", "mot-clé visuel 3"]
};

/* ── Génération principale ───────────── */
async function genererContenu({ sujet, duree = 60, langue = 'fr', style = 'informatif' }) {
  if (!sujet) throw new Error('Le sujet est requis');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquant dans .env');

  const nbMots = Math.round((duree / 60) * 150);

  const prompt = `
Crée un script TikTok ${style} sur le sujet : "${sujet}"

Contraintes :
- Durée cible : ${duree} secondes
- Script d'environ ${nbMots} mots
- Langue : ${langue}
- Ton : engageant, direct, adapté à TikTok
- Commence par une accroche forte (hook) dans les 3 premières secondes

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "titre": "titre accrocheur de max 60 caractères",
  "script": "script complet narré en ${langue}",
  "description": "description TikTok avec emojis, max 150 caractères",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "visual_keywords": ["3 à 5 mots-clés en anglais pour chercher des images sur Pexels"]
}`;

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      },
      { timeout: 30000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Réponse Gemini vide ou malformée');

    return validerEtNormaliser(rawText, sujet);

  } catch (err) {
    if (err.response?.status === 429) {
      throw new Error('QUOTA_EXCEEDED');
    }
    if (err.response?.status === 400) {
      throw new Error(`Paramètre invalide Gemini : ${err.response.data?.error?.message}`);
    }
    console.error("===== ERREUR GEMINI =====");
console.error("URL :", `${GEMINI_API_URL}/${MODEL}:generateContent`);
console.error("Status :", err.response?.status);
console.error("Data :", JSON.stringify(err.response?.data, null, 2));
console.error(err.message);
console.error("========================");

throw err;
  }
}

/* ── Validation et normalisation ─────── */
function validerEtNormaliser(rawText, sujet) {
  let data;

  // Nettoyer le texte (enlever les éventuelles balises markdown)
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    data = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[IA] Erreur parsing JSON :', cleaned.slice(0, 200));
    // Fallback : retourner une structure minimale valide
    return {
      titre: `Vidéo TikTok sur : ${sujet}`,
      script: `Voici une vidéo sur le sujet : ${sujet}. Restez connectés pour plus de contenu.`,
      description: `Découvrez tout sur ${sujet} 🔥 #viral #tiktok`,
      hashtags: ['#tiktok', '#viral', '#contenu'],
      visual_keywords: [sujet, 'people', 'action']
    };
  }

  // Normaliser chaque champ — jamais d'undefined
  return {
    titre:            garantirString(data.titre,        `Vidéo sur : ${sujet}`),
    script:           garantirString(data.script,       `Contenu sur le sujet : ${sujet}`),
    description:      garantirString(data.description,  `${sujet} 🔥 #viral`).slice(0, 150),
    hashtags:         garantirTableau(data.hashtags,    ['#tiktok', '#viral']),
    visual_keywords:  garantirTableau(data.visual_keywords, [sujet, 'people'])
  };
}

/* ── Helpers ─────────────────────────── */
function garantirString(valeur, fallback) {
  if (typeof valeur === 'string' && valeur.trim().length > 0) return valeur.trim();
  return fallback;
}

function garantirTableau(valeur, fallback) {
  if (Array.isArray(valeur) && valeur.length > 0) return valeur;
  return fallback;
}

module.exports = { genererContenu };
