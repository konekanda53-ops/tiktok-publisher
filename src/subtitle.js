/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — subtitle.js
   Génération de sous-titres SRT
   synchronisés avec la voix
═══════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const TMP_DIR = process.env.TMP_DIR || './tmp';

/* ── Générer un fichier SRT depuis un script ── */
function genererSRT({ script, dureeAudio, outputPath }) {
  if (!script || script.trim().length === 0) throw new Error('Script vide pour les sous-titres');

  // Découper en segments (max 8 mots par segment pour TikTok)
  const segments = decouper(script, 8);
  const srt      = construireSRT(segments, dureeAudio || estimerDuree(script));

  const fichier = outputPath || path.join(TMP_DIR, `subs_${Date.now()}.srt`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, srt, 'utf8');

  console.log(`[Subtitles] ✓ ${segments.length} sous-titres générés : ${fichier}`);
  return { fichier, segments, nbSegments: segments.length };
}

/* ── Découper le script en segments ─── */
function decouper(texte, maxMots = 8) {
  // Nettoyer le texte
  const propre = texte
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const mots     = propre.split(' ');
  const segments = [];
  let buffer     = [];

  for (const mot of mots) {
    buffer.push(mot);

    // Couper sur la ponctuation ou quand on atteint maxMots
    const estPonctuation = /[.!?,;:]$/.test(mot);
    if (buffer.length >= maxMots || (estPonctuation && buffer.length >= 3)) {
      segments.push(buffer.join(' '));
      buffer = [];
    }
  }

  // Ajouter le reste
  if (buffer.length > 0) {
    segments.push(buffer.join(' '));
  }

  return segments;
}

/* ── Construire le fichier SRT ───────── */
function construireSRT(segments, dureeTotal) {
  const tempsParsegment = dureeTotal / segments.length;
  const lignes          = [];

  segments.forEach((texte, index) => {
    const debut = index * tempsParsegment;
    const fin   = Math.min((index + 1) * tempsParsegment - 0.1, dureeTotal);

    lignes.push(index + 1);
    lignes.push(`${formaterTemps(debut)} --> ${formaterTemps(fin)}`);
    lignes.push(texte);
    lignes.push(''); // ligne vide entre les entrées
  });

  return lignes.join('\n');
}

/* ── Formater les temps SRT (HH:MM:SS,mmm) ── */
function formaterTemps(secondes) {
  const h   = Math.floor(secondes / 3600);
  const m   = Math.floor((secondes % 3600) / 60);
  const s   = Math.floor(secondes % 60);
  const ms  = Math.round((secondes % 1) * 1000);

  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0')
  ].join(':') + ',' + String(ms).padStart(3, '0');
}

/* ── Estimer la durée d'un texte (secondes) ── */
function estimerDuree(texte) {
  const nbMots = texte.trim().split(/\s+/).length;
  return Math.round((nbMots / 140) * 60); // 140 mots/min en français
}

/* ── Convertir SRT en tableau de segments ── */
function lireSRT(fichier) {
  const contenu  = fs.readFileSync(fichier, 'utf8');
  const blocs    = contenu.trim().split(/\n\n/);
  return blocs.map(bloc => {
    const lignes = bloc.split('\n');
    const temps  = lignes[1]?.split(' --> ') || [];
    return {
      index: parseInt(lignes[0]),
      debut: parseurTemps(temps[0]),
      fin:   parseurTemps(temps[1]),
      texte: lignes.slice(2).join(' ')
    };
  }).filter(s => s.texte);
}

function parseurTemps(str) {
  if (!str) return 0;
  const [hms, ms] = str.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + (parseInt(ms) / 1000);
}

module.exports = { genererSRT, lireSRT, decouper, estimerDuree };
