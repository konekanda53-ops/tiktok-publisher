/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — ia.js
   Génération de contenu via Google Gemini
   JSON Schema strict — plus de JSON.parse cassé
   Plus de fallback générique
═══════════════════════════════════════ */

const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/* ── Prompt système ──────────────────── */
const SYSTEM_PROMPT = `Tu es un scénariste professionnel spécialisé dans les vidéos TikTok virales.
Tu dois TOUJOURS répondre en JSON valide et rien d'autre.
Ne mets jamais de texte avant ou après le JSON.
Ne mets jamais de balises markdown comme \`\`\`json.
Ne résume jamais une histoire : produis toujours un script COMPLET, jamais un résumé.`;

/* ── JSON Schema strict envoyé à Gemini ──────────────────── */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    script: { type: 'string' },
    description: { type: 'string' },
    hashtags: {
      type: 'array',
      items: { type: 'string' }
    },
    visual_keywords: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['titre', 'script', 'description', 'hashtags', 'visual_keywords'],
  propertyOrdering: ['titre', 'script', 'description', 'hashtags', 'visual_keywords']
};

/* ── Génération principale ───────────── */
async function genererContenu({ sujet, duree = 60, langue = 'fr', style = 'informatif' }) {
  if (!sujet) throw new Error('Le sujet est requis');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquant dans .env');

  // Calcul du nombre de mots : ~2.7 mots/seconde pour une narration naturelle
  const nbMots = Math.round((duree / 60) * 420);

  const prompt = `
Tu es un scénariste professionnel spécialisé dans les vidéos TikTok virales.

Sujet : "${sujet}"
Style : ${style}
Langue : ${langue}
Durée cible : ${duree} secondes

Tu dois produire une vidéo COMPLETE. Ne résume jamais.
Le script doit durer environ ${duree} secondes.
Écris environ ${nbMots} mots (ni beaucoup moins, ni beaucoup plus).

Structure obligatoire du script :

HOOK
Débute par une phrase qui choque ou intrigue, pour capter l'attention dès la première seconde.

DÉVELOPPEMENT
Déroule l'histoire progressivement, avec des phrases courtes et naturelles.
Chaque phrase doit donner envie d'écouter la suivante.
Ajoute des émotions et du rythme.

CONCLUSION
Termine par une chute, une révélation ou une morale marquante.

Contraintes sur le texte :
- Le texte doit être parfaitement naturel pour une voix IA (lecture à voix haute).
- Ne mets jamais d'indications de mise en scène comme "Narrateur :", "Musique :", "Plan :", "Scène :".
- Uniquement le texte parlé, rien d'autre.

Description TikTok :
- Moins de 150 caractères.
- Avec emojis pertinents.
- Accrocheuse, donne envie de regarder jusqu'au bout.

Hashtags :
- 5 hashtags pertinents et viraux, en rapport avec le sujet.

Visual keywords (pour rechercher des vidéos/images sur Pexels) :
- Entre 20 et 40 mots-clés, TOUS en anglais.
- Chaque mot-clé représente un élément visuel concret : une personne, un objet, un lieu, une émotion, une action ou une ambiance.
- Aucun doublon.
- Pas de mots abstraits non visualisables.

Réponds uniquement avec l'objet JSON demandé, conforme au schéma fourni.
`;

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      },
      { timeout: 60000 }
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
    throw err;
  }
}

/* ── Validation et normalisation ─────── */
function validerEtNormaliser(rawText, sujet) {
  let data;

  // Nettoyer le texte (au cas où Gemini ajouterait quand même des balises markdown)
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Toujours afficher la réponse complète de Gemini pour pouvoir déboguer
  console.log('========== REPONSE GEMINI ==========');
  console.log(cleaned);
  console.log('=====================================');

  try {
    data = JSON.parse(cleaned);
  } catch (parseErr) {
    // Plus de fallback générique qui produisait des vidéos de 8 secondes.
    // On fait remonter l'erreur pour la voir immédiatement.
    throw new Error(
      `Gemini n'a pas renvoyé un JSON valide. Détail : ${parseErr.message}`
    );
  }

  // Vérification des champs obligatoires
  const champsManquants = ['titre', 'script', 'description', 'hashtags', 'visual_keywords']
    .filter((champ) => data[champ] === undefined || data[champ] === null);

  if (champsManquants.length > 0) {
    throw new Error(
      `Réponse Gemini incomplète, champs manquants : ${champsManquants.join(', ')}`
    );
  }

  if (typeof data.script !== 'string' || data.script.trim().length < 50) {
    throw new Error('Le script renvoyé par Gemini est trop court ou invalide.');
  }

  return {
    titre: String(data.titre).trim(),
    script: String(data.script).trim(),
    description: String(data.description).trim().slice(0, 150),
    hashtags: Array.isArray(data.hashtags) ? data.hashtags : [data.hashtags].filter(Boolean),
    visual_keywords: Array.isArray(data.visual_keywords)
      ? data.visual_keywords
      : [data.visual_keywords].filter(Boolean)
  };
}

module.exports = { genererContenu };
