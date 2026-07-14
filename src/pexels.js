/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — pexels.js
   Recherche d'images HD sans doublons
   avec cache local
═══════════════════════════════════════ */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const TMP_DIR = process.env.TMP_DIR || './tmp';

/* Cache session (évite d'appeler Pexels deux fois pour les mêmes mots-clés) */
const cache = new Map();

/* ── Télécharger les images pour une vidéo ── */
async function obtenirImages({ keywords, nbImages = 5, orientation = 'portrait' }) {
  if (!process.env.PEXELS_API_KEY) throw new Error('PEXELS_API_KEY manquant dans .env');
  if (!keywords || keywords.length === 0) throw new Error('Aucun mot-clé fourni');

  fs.mkdirSync(TMP_DIR, { recursive: true });

  const imagesUtilisees = new Set(); // éviter les doublons d'ID Pexels
  const resultats       = [];

  for (const kw of keywords) {
    if (resultats.length >= nbImages) break;

    try {
      const photos = await rechercherPhotos(kw, orientation);

      for (const photo of photos) {
        if (resultats.length >= nbImages) break;
        if (imagesUtilisees.has(photo.id)) continue;

        imagesUtilisees.add(photo.id);
        const fichier = await telechargerPhoto(photo, kw);

        resultats.push({
          id:          photo.id,
          fichier,
          url:         photo.src.original,
          photographe: photo.photographer,
          keyword:     kw,
          largeur:     photo.width,
          hauteur:     photo.height
        });
      }
    } catch (err) {
      console.warn(`[Pexels] Erreur pour "${kw}" : ${err.message}`);
      // On continue avec le prochain mot-clé
    }
  }

  // Si pas assez d'images, compléter avec une recherche générique
  if (resultats.length === 0) {
    console.warn('[Pexels] Aucune image trouvée avec les mots-clés donnés. Fallback : "nature"');
    const fallback = await rechercherPhotos('nature', orientation);
    for (const photo of fallback.slice(0, nbImages)) {
      const fichier = await telechargerPhoto(photo, 'fallback');
      resultats.push({
        id: photo.id, fichier, url: photo.src.original,
        photographe: photo.photographer, keyword: 'fallback',
        largeur: photo.width, hauteur: photo.height
      });
    }
  }

  console.log(`[Pexels] ✓ ${resultats.length} image(s) obtenue(s)`);
  return resultats;
}

/* ── Recherche sur l'API Pexels ──────── */
async function rechercherPhotos(query, orientation = 'portrait') {
  const cacheKey = `${query}__${orientation}`;
  if (cache.has(cacheKey)) {
    console.log(`[Pexels] Cache hit pour "${query}"`);
    return cache.get(cacheKey);
  }

  const response = await axios.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: {
      query,
      orientation,
      size: 'large',
      per_page: 15,
      locale: 'fr-FR'
    },
    timeout: 15000
  });

  const photos = response.data?.photos || [];
  cache.set(cacheKey, photos);
  return photos;
}

/* ── Télécharger une photo en local ─── */
async function telechargerPhoto(photo, keyword) {
  // Utiliser la version "large2x" pour avoir une bonne qualité sans trop de poids
  const urlImage = photo.src.large2x || photo.src.large || photo.src.original;
  const ext      = 'jpg';
  const nomFichier = `img_${keyword.replace(/\s+/g, '_')}_${photo.id}.${ext}`;
  const fichier  = path.join(TMP_DIR, nomFichier);

  // Si déjà téléchargée dans cette session, la réutiliser
  if (fs.existsSync(fichier)) {
    return fichier;
  }

  const response = await axios.get(urlImage, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'TikTokIAStudio/2.0' }
  });

  fs.writeFileSync(fichier, response.data);
  console.log(`[Pexels] ✓ Téléchargé : ${nomFichier}`);
  return fichier;
}

/* ── Vider le cache (entre deux vidéos) ── */
function viderCache() {
  cache.clear();
  console.log('[Pexels] Cache vidé');
}

module.exports = { obtenirImages, viderCache };
