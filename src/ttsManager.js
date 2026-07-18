/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — ttsManager.js
   Text-to-Speech via Gemini 2.5 TTS
   ─────────────────────────────────────
   Remplace entièrement Google Cloud TTS.
   Utilise uniquement GEMINI_API_KEY.
   Retry automatique × 3 si quota dépassé.
═══════════════════════════════════════ */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const TMP_DIR      = process.env.TMP_DIR || './tmp';
const GEMINI_API   = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_TTS    = 'gemini-2.5-flash-preview-tts';

const MAX_RETRIES  = 3;
const RETRY_DELAYS = [4000, 10000, 20000]; // ms entre chaque tentative

/* ── Voix Gemini disponibles ─────────── */
/*
  Gemini TTS est multilingue : la même voix
  parle français, anglais, etc. selon le texte.

  Voix disponibles (mai 2025) :
  ┌─────────────┬──────────┬────────────────────────────┐
  │ Nom         │ Genre    │ Caractère                  │
  ├─────────────┼──────────┼────────────────────────────┤
  │ Aoede       │ Féminin  │ Douce, narrative           │
  │ Charon      │ Masculin │ Grave, posé                │
  │ Fenrir      │ Masculin │ Dynamique, énergique       │
  │ Kore        │ Féminin  │ Claire, professionnelle    │
  │ Puck        │ Masculin │ Vif, expressif             │
  │ Orbit       │ Masculin │ Neutre, informatif         │
  │ Zephyr      │ Féminin  │ Légère, moderne            │
  │ Leda        │ Féminin  │ Chaleureuse                │
  └─────────────┴──────────┴────────────────────────────┘
*/
const VOIX_GEMINI = {
  féminin: {
    douce:          'Aoede',
    claire:         'Kore',
    moderne:        'Zephyr',
    chaleureuse:    'Leda'
  },
  masculin: {
    grave:          'Charon',
    dynamique:      'Fenrir',
    expressif:      'Puck',
    neutre:         'Orbit'
  }
};

/* Voix par défaut selon la langue */
const VOIX_PAR_DEFAUT = {
  'fr-FR': 'Aoede',   // Féminine douce — très bien pour le français
  'en-US': 'Orbit',   // Neutre informatif
  'default': 'Aoede'
};

/* ══════════════════════════════════════
   FONCTION PRINCIPALE
══════════════════════════════════════ */
async function genererVoix({ texte, langue = 'fr-FR', voix = null, outputPath }) {
  if (!texte || texte.trim().length === 0) {
    throw new Error('Texte vide — impossible de générer la voix.');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY manquant dans votre fichier .env');
  }

  // Choisir la voix
  const nomVoix = voix || VOIX_PAR_DEFAUT[langue] || VOIX_PAR_DEFAUT['default'];

  // Préparer le fichier de sortie (.wav — Gemini retourne du PCM/WAV)
  const fichier = outputPath
    ? outputPath.replace(/\.(mp3|ogg)$/i, '.wav')
    : path.join(TMP_DIR, `voix_${Date.now()}.wav`);

  fs.mkdirSync(path.dirname(fichier), { recursive: true });

  // Boucle de tentatives
  for (let tentative = 1; tentative <= MAX_RETRIES; tentative++) {
    try {
      console.log(`[TTS Gemini] Tentative ${tentative}/${MAX_RETRIES} | voix : ${nomVoix} | langue : ${langue}`);

      const audioBase64 = await appelGeminiTTS({ texte, nomVoix });

const pcm = Buffer.from(audioBase64, "base64");

const wav = Buffer.concat([
  creerHeaderWav(pcm.length),
  pcm
]);

fs.writeFileSync(fichier, wav);

      const stats = fs.statSync(fichier);

console.log("Audio :", fichier);
console.log("Taille :", stats.size);

const fd = fs.openSync(fichier, "r");
const buffer = Buffer.alloc(16);

fs.readSync(fd, buffer, 0, 16, 0);
fs.closeSync(fd);

console.log(buffer);

      const duree = estimerDuree(texte);
      console.log(
  `[TTS Gemini] ✓ Audio généré : ${fichier} (~${duree}s | ${(wav.length / 1024).toFixed(0)} Ko)`
);
      return {
        success : true,
        fichier,
        duree,
        langue,
        voix    : nomVoix,
        modele  : MODEL_TTS
      };

    } catch (err) {
      const peutReessayer = estErreurRecuperable(err);

      if (tentative < MAX_RETRIES && peutReessayer) {
        const delai = RETRY_DELAYS[tentative - 1];
        console.warn(`[TTS Gemini] ${formaterCodeErreur(err)} — nouvelle tentative dans ${delai / 1000}s...`);
        await attendre(delai);
        continue;
      }

      // Toutes les tentatives épuisées ou erreur non récupérable
      throw new Error(formaterMessageErreur(err, tentative));
    }
  }
}

/* ══════════════════════════════════════
   APPEL API GEMINI TTS
══════════════════════════════════════ */
async function appelGeminiTTS({ texte, nomVoix }) {
  const url = `${GEMINI_API}/${MODEL_TTS}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          parts: [{ text: texte }]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: nomVoix
            }
          }
        }
      }
    },
    {
      timeout: 60000,  // 60s — les longs textes peuvent prendre du temps
      headers: { 'Content-Type': 'application/json' }
    }
  );

  // Extraire l'audio de la réponse
  const part = response.data?.candidates?.[0]?.content?.parts?.[0];

if (!part?.inlineData?.data) {
  console.error('[TTS Gemini] Réponse inattendue :', JSON.stringify(response.data).slice(0, 300));
  throw new Error('Réponse Gemini TTS vide ou format inattendu.');
}

// 🔍 DEBUG : afficher le format audio renvoyé par Gemini
console.log('[TTS Gemini] MIME TYPE :', part.inlineData.mimeType);
console.log('[TTS Gemini] Taille base64 :', part.inlineData.data.length);

return part.inlineData.data; // base64
}

/* ── Convertit le PCM en vrai fichier WAV ── */
function creerHeaderWav(dataLength) {
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(24000, 24); // 24 kHz
  header.writeUInt32LE(24000 * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function estimerDuree(texte) {
  // ~140 mots/minute en français, ~150 en anglais
  const nbMots = texte.trim().split(/\s+/).length;
  return Math.round((nbMots / 140) * 60);
}

function estErreurRecuperable(err) {
  const status = err.response?.status;
  // 429 = quota, 5xx = erreur serveur temporaire
  return status === 429 || (status >= 500 && status < 600);
}

function formaterCodeErreur(err) {
  const status = err.response?.status;
  if (status === 429) return 'Quota dépassé (429)';
  if (status >= 500)  return `Erreur serveur (${status})`;
  return err.message;
}

function formaterMessageErreur(err, nbTentatives) {
  const status = err.response?.status;

  if (status === 429) {
    return `Le service de voix Gemini est momentanément surchargé après ${nbTentatives} tentative(s). Attendez quelques minutes et réessayez.`;
  }
  if (status === 401 || status === 403) {
    return 'Clé Gemini invalide ou sans permission TTS. Vérifiez GEMINI_API_KEY dans votre .env et activez l\'API Gemini sur Google AI Studio.';
  }
  if (status === 404) {
    return `Modèle Gemini TTS introuvable (${MODEL_TTS}). Vérifiez que le modèle est bien disponible dans votre région.`;
  }
  if (status >= 500) {
    return `Serveur Gemini TTS indisponible (${status}) après ${nbTentatives} tentative(s). Réessayez plus tard.`;
  }
  if (err.code === 'ECONNABORTED') {
    return 'Timeout Gemini TTS — le texte est peut-être trop long. Essayez de réduire le script à moins de 500 mots.';
  }
  return `Erreur Gemini TTS inattendue : ${err.message}`;
}

/* ── Lister les voix disponibles ─────── */
function listerVoix() {
  return Object.entries(VOIX_GEMINI).flatMap(([genre, voix]) =>
    Object.entries(voix).map(([caractere, nom]) => ({
      nom,
      genre,
      caractere,
      modele: MODEL_TTS
    }))
  );
}

module.exports = { genererVoix, listerVoix, VOIX_GEMINI };
