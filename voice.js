// Utilise le TTS natif de Gemini (même clé API que la génération de texte).
// Sortie : PCM brut 16 bits, mono, 24 kHz, SANS en-tête WAV (c'est ainsi que
// l'API le renvoie). On l'enveloppe nous-mêmes dans un fichier WAV pour
// l'aperçu navigateur, et on le fournit brut à ffmpeg pour le montage vidéo.

const MODELE_TTS = "gemini-3.1-flash-tts-preview";
export const FREQUENCE_ECHANTILLONNAGE = 24000;
const OCTETS_PAR_ECHANTILLON = 2; // 16 bits

// Au-delà de cette taille, on découpe le texte en plusieurs appels TTS et on
// concatène les pistes PCM obtenues bout à bout (concaténation valide pour du
// PCM brut sans en-tête). Ça évite les troncatures ou échecs silencieux sur
// les scripts longs (ex. "3 min").
const TAILLE_MAX_PAR_APPEL = 900; // caractères

function normaliserTexte(texte) {
  if (Array.isArray(texte)) return texte.join(" ");
  if (typeof texte === "string") return texte;
  return String(texte ?? "");
}

function decouperEnBlocs(texte) {
  const phrases = texte.split(/(?<=[.!?])\s+/).filter(Boolean);
  const blocs = [];
  let blocCourant = "";

  for (const phrase of phrases) {
    if (blocCourant && (blocCourant + " " + phrase).trim().length > TAILLE_MAX_PAR_APPEL) {
      blocs.push(blocCourant.trim());
      blocCourant = phrase;
    } else {
      blocCourant = (blocCourant + " " + phrase).trim();
    }
  }
  if (blocCourant) blocs.push(blocCourant);

  return blocs.length ? blocs : [texte];
}

async function genererVoixUnBloc({ apiKey, texte, voix }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_TTS}:generateContent?key=${apiKey}`;

  const reponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: texte }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voix } } },
      },
    }),
  });

  const data = await reponse.json();
  if (data.error) throw new Error(data.error.message || "Erreur génération voix");

  const audioBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioBase64) throw new Error("Aucun audio renvoyé par le modèle de voix.");

  return Buffer.from(audioBase64, "base64");
}

export async function genererVoix({ apiKey, texte, voix = "Kore" }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

  const texteNormalise = normaliserTexte(texte).trim();
  if (!texteNormalise) throw new Error("Texte vide : rien à transformer en voix.");

  const blocs = decouperEnBlocs(texteNormalise);
  const morceaux = [];
  for (const bloc of blocs) {
    morceaux.push(await genererVoixUnBloc({ apiKey, texte: bloc, voix }));
  }

  return Buffer.concat(morceaux);
}

// Ajoute un en-tête WAV (44 octets) à du PCM brut, pour qu'il soit lisible
// directement par un <audio> de navigateur ou tout lecteur standard.
export function envelopperEnWav(pcmBuffer, { frequence = FREQUENCE_ECHANTILLONNAGE, canaux = 1 } = {}) {
  const octetsParBloc = canaux * OCTETS_PAR_ECHANTILLON;
  const octetsParSeconde = frequence * octetsParBloc;
  const entete = Buffer.alloc(44);

  entete.write("RIFF", 0);
  entete.writeUInt32LE(36 + pcmBuffer.length, 4);
  entete.write("WAVE", 8);
  entete.write("fmt ", 12);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(canaux, 22);
  entete.writeUInt32LE(frequence, 24);
  entete.writeUInt32LE(octetsParSeconde, 28);
  entete.writeUInt16LE(octetsParBloc, 32);
  entete.writeUInt16LE(OCTETS_PAR_ECHANTILLON * 8, 34);
  entete.write("data", 36);
  entete.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([entete, pcmBuffer]);
}

// Durée en secondes d'un buffer PCM brut, utile pour caler les images.
export function dureeSecondes(pcmBuffer, { frequence = FREQUENCE_ECHANTILLONNAGE, canaux = 1 } = {}) {
  return pcmBuffer.length / (frequence * canaux * OCTETS_PAR_ECHANTILLON);
}
