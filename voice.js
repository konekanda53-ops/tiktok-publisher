// Utilise le TTS natif de Gemini (même clé API que la génération de texte).
// Sortie : PCM brut 16 bits, mono, 24 kHz, SANS en-tête WAV (c'est ainsi que
// l'API le renvoie). On l'enveloppe nous-mêmes dans un fichier WAV pour
// l'aperçu navigateur, et on le fournit brut à ffmpeg pour le montage vidéo.

const MODELE_TTS = "gemini-3.1-flash-tts-preview";
export const FREQUENCE_ECHANTILLONNAGE = 24000;
const OCTETS_PAR_ECHANTILLON = 2; // 16 bits

export async function genererVoix({ apiKey, texte, voix = "Kore" }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante");
  if (!texte || !texte.trim()) throw new Error("Texte vide : rien à transformer en voix.");

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

  return Buffer.from(audioBase64, "base64"); // PCM brut
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
  entete.writeUInt32LE(16, 16); // taille du sous-bloc fmt
  entete.writeUInt16LE(1, 20); // format PCM
  entete.writeUInt16LE(canaux, 22);
  entete.writeUInt32LE(frequence, 24);
  entete.writeUInt32LE(octetsParSeconde, 28);
  entete.writeUInt16LE(octetsParBloc, 32);
  entete.writeUInt16LE(OCTETS_PAR_ECHANTILLON * 8, 34); // bits par échantillon
  entete.write("data", 36);
  entete.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([entete, pcmBuffer]);
}

// Durée en secondes d'un buffer PCM brut, utile pour caler les images.
export function dureeSecondes(pcmBuffer, { frequence = FREQUENCE_ECHANTILLONNAGE, canaux = 1 } = {}) {
  return pcmBuffer.length / (frequence * canaux * OCTETS_PAR_ECHANTILLON);
}
