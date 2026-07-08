import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { FREQUENCE_ECHANTILLONNAGE, dureeSecondes } from "./voice.js";

const execFileAsync = promisify(execFile);

// Assemble une liste d'images (Buffers PNG) + une piste vocale (PCM brut) en
// une vidéo verticale MP4 1080x1920, chaque image occupant une durée égale
// répartie sur toute la durée de l'audio. Pas de sous-titres incrustés pour
// l'instant (simplification volontaire du premier jet).
export async function assemblerVideo({ images, audioPcm }) {
  if (!images?.length) throw new Error("Aucune image à assembler.");
  if (!audioPcm?.length) throw new Error("Aucun audio à assembler.");
  if (!ffmpegPath) throw new Error("Binaire ffmpeg introuvable (dépendance ffmpeg-static manquante).");

  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-video-"));

  try {
    const cheminsImages = [];
    for (let i = 0; i < images.length; i++) {
      const chemin = path.join(dossier, `image-${String(i).padStart(2, "0")}.png`);
      await fs.writeFile(chemin, images[i]);
      cheminsImages.push(chemin);
    }

    const cheminAudio = path.join(dossier, "audio.pcm");
    await fs.writeFile(cheminAudio, audioPcm);

    const dureeTotale = dureeSecondes(audioPcm);
    const dureeParImage = dureeTotale / images.length;

    // Format attendu par le "concat demuxer" de ffmpeg : chaque image suivie
    // de sa durée, sauf la dernière qui doit être répétée sans durée.
    const lignes = cheminsImages
      .map((chemin) => `file '${chemin}'\nduration ${dureeParImage.toFixed(3)}`)
      .join("\n");
    const listeChemin = path.join(dossier, "liste.txt");
    await fs.writeFile(listeChemin, `${lignes}\nfile '${cheminsImages[cheminsImages.length - 1]}'\n`);

    const cheminSortie = path.join(dossier, "sortie.mp4");

    await execFileAsync(ffmpegPath, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listeChemin,
      "-f", "s16le",
      "-ar", String(FREQUENCE_ECHANTILLONNAGE),
      "-ac", "1",
      "-i", cheminAudio,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      cheminSortie,
    ]);

    return await fs.readFile(cheminSortie);
  } finally {
    await fs.rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
