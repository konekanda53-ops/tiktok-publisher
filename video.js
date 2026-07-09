import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { FREQUENCE_ECHANTILLONNAGE, dureeSecondes } from "./voice.js";
import { genererAss } from "./subtitles.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER_POLICES = path.join(__dirname, "fonts");

const LARGEUR = 1080;
const HAUTEUR = 1920;
const FPS = 30;

// Assemble une liste d'images (Buffers) + une piste vocale (PCM brut) + le
// texte du script en une vidéo verticale MP4 1080x1920, dans un style proche
// de TikTok :
//  - chaque image occupe une durée égale répartie sur toute la durée audio,
//    avec un lent zoom avant ("effet Ken Burns") plutôt qu'une image figée ;
//  - le texte du script est incrusté en légendes courtes, gras blanc à
//    contour noir, centrées dans le tiers inférieur.
export async function assemblerVideo({ images, audioPcm, texteSousTitres }) {
  if (!images?.length) throw new Error("Aucune image à assembler.");
  if (!audioPcm?.length) throw new Error("Aucun audio à assembler.");
  if (!ffmpegPath) throw new Error("Binaire ffmpeg introuvable (dépendance ffmpeg-static manquante).");

  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-video-"));

  try {
    const dureeTotale = dureeSecondes(audioPcm);
    const dureeParImage = dureeTotale / images.length;

    const cheminsImages = [];
    for (let i = 0; i < images.length; i++) {
      const chemin = path.join(dossier, `image-${String(i).padStart(2, "0")}.png`);
      await fs.writeFile(chemin, images[i]);
      cheminsImages.push(chemin);
    }

    const cheminAudio = path.join(dossier, "audio.pcm");
    await fs.writeFile(cheminAudio, audioPcm);

    let cheminAss = null;
    if (texteSousTitres && texteSousTitres.trim()) {
      cheminAss = path.join(dossier, "sous-titres.ass");
      await fs.writeFile(cheminAss, genererAss({ texte: texteSousTitres, dureeTotale }));
    }

    const cheminSortie = path.join(dossier, "sortie.mp4");

    // --- Construction de la commande ffmpeg ---
    // Une entrée par image (bouclée sur sa durée), plus l'audio en dernière
    // entrée. Chaque flux vidéo reçoit : agrandissement (pour laisser de la
    // marge au zoom), zoompan (Ken Burns), puis mise au format final.
    const argsEntrees = [];
    const filtresImages = [];
    for (let i = 0; i < cheminsImages.length; i++) {
      argsEntrees.push("-loop", "1", "-t", dureeParImage.toFixed(3), "-i", cheminsImages[i]);
      const nbFrames = Math.max(1, Math.round(dureeParImage * FPS));
      filtresImages.push(
        `[${i}:v]scale=${LARGEUR * 1.25}:${HAUTEUR * 1.25}:force_original_aspect_ratio=increase,` +
        `crop=${LARGEUR * 1.25}:${HAUTEUR * 1.25},` +
        `zoompan=z='min(zoom+0.0018,1.2)':d=${nbFrames}:s=${LARGEUR}x${HAUTEUR}:fps=${FPS},` +
        `setsar=1[v${i}]`
      );
    }

    const indexAudio = cheminsImages.length;
    argsEntrees.push("-f", "s16le", "-ar", String(FREQUENCE_ECHANTILLONNAGE), "-ac", "1", "-i", cheminAudio);

    const entreesConcat = cheminsImages.map((_, i) => `[v${i}]`).join("");
    let filtreComplet = `${filtresImages.join("; ")}; ${entreesConcat}concat=n=${cheminsImages.length}:v=1:a=0[vconcat]`;

    let sortieVideo = "[vconcat]";
    if (cheminAss) {
      // Chemin échappé pour le filtre subtitles (les ':' et '\' doivent être protégés)
      const cheminAssEchappe = cheminAss.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
      const dossierPolicesEchappe = DOSSIER_POLICES.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
      filtreComplet += `; [vconcat]subtitles='${cheminAssEchappe}':fontsdir='${dossierPolicesEchappe}'[vout]`;
      sortieVideo = "[vout]";
    }

    try {
      await execFileAsync(ffmpegPath, [
        "-y",
        ...argsEntrees,
        "-filter_complex", filtreComplet,
        "-map", sortieVideo,
        "-map", `${indexAudio}:a`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        cheminSortie,
      ]);
    } catch (e) {
      const details = (e.stderr || e.message || "").toString();
      if (cheminAss && /no such filter|subtitles/i.test(details)) {
        throw new Error(
          "Le binaire ffmpeg utilisé ne supporte pas l'incrustation de sous-titres (filtre 'subtitles'/libass manquant). " +
          `Détail ffmpeg : ${details.slice(-400)}`
        );
      }
      throw new Error(`ffmpeg a échoué : ${details.slice(-400) || e.message}`);
    }

    return await fs.readFile(cheminSortie);
  } finally {
    await fs.rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
