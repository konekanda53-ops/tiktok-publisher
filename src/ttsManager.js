/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — ttsManager.js
   Text-to-Speech avec retry automatique
   et messages d'erreur clairs
═══════════════════════════════════════ */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const TMP_DIR       = process.env.TMP_DIR || './tmp';
const MAX_RETRIES   = 3;
const RETRY_DELAYS  = [3000, 8000, 15000]; // ms entre chaque tentative

/* ── Voix disponibles ────────────────── */
const VOIX = {
  'fr-FR': {
    standard: 'fr-FR-Standard-A',
    hd:       'fr-FR-Neural2-A',
    masculine:'fr-FR-Standard-B'
  },
  'en-US': {
    standard: 'en-US-Standard-A',
    hd:       'en-US-Neural2-A',
    masculine:'en-US-Standard-B'
  }
};

/* ── Génération principale ───────────── */
async function genererVoix({ texte, langue = 'fr-FR', qualite = 'standard', outputPath }) {
  if (!texte || texte.trim().length === 0) throw new Error('Texte vide pour la voix');
  if (!process.env.GOOGLE_TTS_API_KEY) throw new Error('GOOGLE_TTS_API_KEY manquant dans .env');

  const nomVoix = VOIX[langue]?.[qualite] || VOIX['fr-FR'].standard;
  const fichier  = outputPath || path.join(TMP_DIR, `voix_${Date.now()}.mp3`);

  // S'assurer que le dossier existe
  fs.mkdirSync(path.dirname(fichier), { recursive: true });

  for (let tentative = 1; tentative <= MAX_RETRIES; tentative++) {
    try {
      console.log(`[TTS] Tentative ${tentative}/${MAX_RETRIES} — voix : ${nomVoix}`);

      const audio = await appelAPITTS({ texte, langue, nomVoix });
      fs.writeFileSync(fichier, Buffer.from(audio, 'base64'));

      console.log(`[TTS] ✓ Voix générée : ${fichier}`);
      return {
        success:  true,
        fichier,
        duree:    estimerDuree(texte),
        langue,
        voix:     nomVoix
      };

    } catch (err) {
      const estQuota    = err.code === 'QUOTA' || err.response?.status === 429;
      const estServeur  = err.response?.status >= 500;
      const peutReessayer = estQuota || estServeur;

      if (tentative < MAX_RETRIES && peutReessayer) {
        const delai = RETRY_DELAYS[tentative - 1];
        console.warn(`[TTS] Quota/erreur serveur. Nouvelle tentative dans ${delai / 1000}s...`);
        await attendre(delai);
        continue;
      }
      console.error("===== ERREUR GOOGLE TTS =====");
console.error("Status :", err.response?.status);
console.error("Data :", JSON.stringify(err.response?.data, null, 2));

      // Erreur finale — message lisible
      throw new Error(formaterErreurTTS(err, tentative));
    }
  }
}

/* ── Appel API Google TTS ────────────── */
async function appelAPITTS({ texte, langue, nomVoix }) {
  const response = await axios.post(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
    {
      input: { text: texte },
      voice: {
        languageCode: langue,
        name: nomVoix,
        ssmlGender: nomVoix.includes('-B') ? 'MALE' : 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0,
        volumeGainDb: 0
      }
    },
    { timeout: 30000 }
  );

  if (!response.data?.audioContent) {
    throw new Error('Réponse TTS vide');
  }

  return response.data.audioContent;
}

/* ── Helpers ─────────────────────────── */
function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function estimerDuree(texte) {
  // Environ 140 mots par minute en français
  const nbMots = texte.trim().split(/\s+/).length;
  return Math.round((nbMots / 140) * 60);
}

function formaterErreurTTS(err, tentatives) {
  if (err.response?.status === 429) {
    return `Le service de voix est momentanément surchargé après ${tentatives} tentative(s). Réessayez dans quelques minutes.`;
  }
  if (err.response?.status === 401 || err.response?.status === 403) {
    return 'Clé API Google TTS invalide ou non autorisée. Vérifiez GOOGLE_TTS_API_KEY dans votre .env';
  }
  if (err.response?.status >= 500) {
    return `Serveur Google TTS indisponible (${err.response.status}). Réessayez plus tard.`;
  }
  if (err.code === 'ECONNABORTED') {
    return 'Timeout TTS — le texte est peut-être trop long. Essayez de réduire le script.';
  }
  return `Erreur TTS inattendue : ${err.message}`;
}

/* ── Liste les voix disponibles ──────── */
function listerVoix() {
  return Object.entries(VOIX).flatMap(([lang, voix]) =>
    Object.entries(voix).map(([qualite, nom]) => ({ langue: lang, qualite, nom }))
  );
}

module.exports = { genererVoix, listerVoix };
