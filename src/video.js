/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — video.js
   Montage vidéo avec FFmpeg
   Un seul objet videoData en entrée
═══════════════════════════════════════ */

const ffmpeg  = require('fluent-ffmpeg');
const fs      = require('fs');
const path    = require('path');

const TMP_DIR    = process.env.TMP_DIR    || './tmp';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

/* ── Format TikTok ───────────────────── */
const FORMAT_TIKTOK = {
  largeur:  1080,
  hauteur:  1920,
  fps:      30,
  codec:    'libx264',
  preset:   'fast',
  crf:      23          // qualité (18=max, 28=min)
};

/* ── Créer la vidéo ──────────────────── */
async function creerVideo(videoData) {
  const {
    images,           // [{ fichier, dureeAffichage }] ou juste [{ fichier }]
    voixFichier,      // chemin MP3
    sousTitresFichier,// chemin SRT (optionnel)
    dureeAudio,       // durée en secondes
    titre,            // pour nommer le fichier de sortie
    musiqueFichier    // chemin MP3 musique de fond (optionnel)
  } = videoData;

  // Validation
  if (!images || images.length === 0) throw new Error('Aucune image fournie pour la vidéo');
  if (!voixFichier || !fs.existsSync(voixFichier)) throw new Error('Fichier voix introuvable');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR,    { recursive: true });

  // Calculer la durée d'affichage de chaque image
  const dureeParImage = dureeAudio / images.length;
  const imagesAvecDuree = images.map(img => ({
    ...img,
    dureeAffichage: img.dureeAffichage || dureeParImage
  }));

  // 1. Créer la liste d'images pour FFmpeg (concat demuxer)
  const listeFichier = await creerListeImages(imagesAvecDuree);

  // 2. Nommer le fichier de sortie
  const nomFichier = `${slugifier(titre || 'video')}_${Date.now()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, nomFichier);

  // 3. Construire et lancer FFmpeg
  await monterVideo({
    listeFichier,
    voixFichier,
    musiqueFichier,
    sousTitresFichier,
    outputPath,
    dureeAudio
  });

  // 4. Nettoyer les fichiers temporaires
  nettoyerTemp([listeFichier]);

  const stats = fs.statSync(outputPath);
  console.log(`[Video] ✓ Vidéo créée : ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} Mo)`);

  return {
    success: true,
    fichier: outputPath,
    nom:     nomFichier,
    taille:  stats.size,
    duree:   dureeAudio
  };
}

/* ── Créer le fichier liste FFmpeg ───── */

async function creerListeImages(images) {

  fs.mkdirSync(TMP_DIR, { recursive: true });

  const listeFichier = path.resolve(
    TMP_DIR,
    `liste_${Date.now()}.txt`
  );

  let contenu = "";

  for (const img of images) {

    const imagePath = path.resolve(img.fichier);

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image introuvable : ${imagePath}`);
    }

    contenu += `file '${imagePath.replace(/\\/g, "/")}'\n`;
    contenu += `duration ${img.dureeAffichage.toFixed(3)}\n`;
  }

  const derniereImage = path.resolve(images[images.length - 1].fichier);
  contenu += `file '${derniereImage.replace(/\\/g, "/")}'\n`;

  fs.writeFileSync(listeFichier, contenu, "utf8");

  if (!fs.existsSync(listeFichier)) {
    throw new Error(`Impossible de créer ${listeFichier}`);
  }

  console.log("[Video] Liste FFmpeg :", listeFichier);

  return listeFichier;
}

/* ── Montage FFmpeg principal ────────── */
function monterVideo({
  listeFichier,
  voixFichier,
  musiqueFichier,
  sousTitresFichier,
  outputPath,
  dureeAudio
}) {
  return new Promise((resolve, reject) => {

    // Vérifications
    if (!fs.existsSync(listeFichier)) {
      return reject(new Error(`Liste FFmpeg introuvable : ${listeFichier}`));
    }

    if (!fs.existsSync(voixFichier)) {
      return reject(new Error(`Voix introuvable : ${voixFichier}`));
    }

    console.log("[Video] FFmpeg va lire :", listeFichier);

    let cmd = ffmpeg();

    // Input 1 : liste des images
    cmd.input(listeFichier)
      .inputOptions([
        "-f", "concat",
        "-safe", "0"
      ]);

    // Input 2 : voix
    cmd.input(voixFichier);

    // Input 3 : musique (optionnelle)
    const avecMusique =
      musiqueFichier &&
      fs.existsSync(musiqueFichier);

    if (avecMusique) {
      cmd.input(musiqueFichier);
    }

    // Filtre vidéo
    cmd.outputOptions([
      "-vf", construireFiltrVideo(sousTitresFichier),
      "-c:v", FORMAT_TIKTOK.codec,
      "-preset", FORMAT_TIKTOK.preset,
      "-crf", FORMAT_TIKTOK.crf,
      "-r", FORMAT_TIKTOK.fps,
      "-pix_fmt", "yuv420p",
      "-t", String(dureeAudio)
    ]);

    // Audio
    if (avecMusique) {

      cmd.outputOptions([
        "-filter_complex",
        "[1:a][2:a]amix=inputs=2:weights=1 0.2[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:a", "aac",
        "-b:a", "192k"
      ]);

    } else {

      cmd.outputOptions([
        "-map", "0:v",
        "-map", "1:a",
        "-c:a", "aac",
        "-b:a", "192k"
      ]);

    }

    cmd
      .output(outputPath)

      .on("start", commandLine => {
        console.log("===== COMMANDE FFMPEG =====");
        console.log(commandLine);
        console.log("===========================");
      })

      .on("progress", progress => {
        if (progress.percent) {
          process.stdout.write(
            `\r[FFmpeg] ${Math.round(progress.percent)}%`
          );
        }
      })

      .on("end", () => {
        process.stdout.write("\n");
        resolve();
      })

      .on("error", (err, stdout, stderr) => {
        console.error("===== STDERR FFMPEG =====");
        console.error(stderr);
        console.error("=========================");
        reject(err);
      })

      .run();

  });
}
/* ── Filtre vidéo (resize + sous-titres) ── */
function construireFiltrVideo(sousTitresFichier) {
  const resize = `scale=${FORMAT_TIKTOK.largeur}:${FORMAT_TIKTOK.hauteur}:force_original_aspect_ratio=decrease,pad=${FORMAT_TIKTOK.largeur}:${FORMAT_TIKTOK.hauteur}:(ow-iw)/2:(oh-ih)/2:black`;

  if (sousTitresFichier && fs.existsSync(sousTitresFichier)) {
    // Sous-titres style TikTok : blanc avec contour noir, centré en bas
    const cheminSubs = sousTitresFichier.replace(/\\/g, '/').replace(/:/g, '\\:');
    const styleSubs  = 'FontSize=48,FontName=Arial,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=3,Alignment=2,MarginV=120';
    return `${resize},subtitles='${cheminSubs}':force_style='${styleSubs}'`;
  }

  return resize;
}

/* ── Helpers ─────────────────────────── */
function slugifier(texte) {
  return texte
    .toLowerCase()
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);
}

function nettoyerTemp(fichiers) {
  fichiers.forEach(f => {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); }
    catch (_) { /* silencieux */ }
  });
}

module.exports = { creerVideo };
