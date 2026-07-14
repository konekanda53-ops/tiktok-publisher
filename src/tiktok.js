/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — tiktok.js
   Publication de vidéos sur TikTok
   via l'API Content Posting
═══════════════════════════════════════ */

const axios    = require('axios');
const fs       = require('fs');
const FormData = require('form-data');

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

/* ── Publier une vidéo ───────────────── */
async function publierVideo({ fichierVideo, titre, description, hashtags = [], modePublic = false }) {
  if (!process.env.TIKTOK_ACCESS_TOKEN) throw new Error('TIKTOK_ACCESS_TOKEN manquant dans .env');
  if (!fs.existsSync(fichierVideo)) throw new Error('Fichier vidéo introuvable');

  const caption = construireCaption(titre, description, hashtags);
  const tailleFichier = fs.statSync(fichierVideo).size;

  console.log(`[TikTok] Initialisation de l'upload (${(tailleFichier / 1024 / 1024).toFixed(1)} Mo)...`);

  // Étape 1 : Initialiser l'upload
  const { uploadUrl, videoId, publishId } = await initialiserUpload({
    caption,
    tailleFichier,
    modePublic
  });

  // Étape 2 : Uploader la vidéo
  console.log('[TikTok] Upload de la vidéo...');
  await uploaderVideo({ uploadUrl, fichierVideo, tailleFichier });

  // Étape 3 : Vérifier le statut
  console.log('[TikTok] Vérification du statut...');
  const statut = await verifierStatut(publishId);

  console.log(`[TikTok] ✓ Vidéo publiée ! ID : ${publishId}`);

  return {
    success:    true,
    publishId,
    videoId,
    statut,
    caption,
    lien:       `https://www.tiktok.com/@me/video/${videoId}`
  };
}

/* ── Initialiser l'upload (Direct Post API) ── */
async function initialiserUpload({ caption, tailleFichier, modePublic }) {
  const response = await axios.post(
    `${TIKTOK_API}/post/publish/video/init/`,
    {
      post_info: {
        title:          caption,
        privacy_level:  modePublic ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY', // brouillon par défaut
        disable_duet:   false,
        disable_comment:false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source:          'FILE_UPLOAD',
        video_size:      tailleFichier,
        chunk_size:      tailleFichier,
        total_chunk_count: 1
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
        'Content-Type':  'application/json; charset=UTF-8'
      },
      timeout: 30000
    }
  );

  const data = response.data?.data;
  if (!data?.upload_url) {
    throw new Error(`TikTok init échoué : ${JSON.stringify(response.data)}`);
  }

  return {
    uploadUrl: data.upload_url,
    videoId:   data.video_id || '',
    publishId: data.publish_id
  };
}

/* ── Uploader la vidéo ───────────────── */
async function uploaderVideo({ uploadUrl, fichierVideo, tailleFichier }) {
  const videoBuffer = fs.readFileSync(fichierVideo);

  const response = await axios.put(uploadUrl, videoBuffer, {
    headers: {
      'Content-Type':   'video/mp4',
      'Content-Length': tailleFichier,
      'Content-Range':  `bytes 0-${tailleFichier - 1}/${tailleFichier}`
    },
    timeout: 120000,  // 2 minutes max pour l'upload
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Upload TikTok échoué : status ${response.status}`);
  }
}

/* ── Vérifier le statut de publication ── */
async function verifierStatut(publishId, maxTentatives = 10) {
  for (let i = 1; i <= maxTentatives; i++) {
    await attendre(3000);

    const response = await axios.post(
      `${TIKTOK_API}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type':  'application/json'
        }
      }
    );

    const statut = response.data?.data?.status;
    console.log(`[TikTok] Statut (tentative ${i}) : ${statut}`);

    if (statut === 'PUBLISH_COMPLETE') return 'publié';
    if (statut === 'FAILED')           throw new Error('Publication TikTok échouée');
  }

  return 'en_attente';
}

/* ── Helpers ─────────────────────────── */
function construireCaption(titre, description, hashtags) {
  const tags = hashtags.join(' ');
  let caption = '';

  if (titre)       caption += titre + '\n';
  if (description) caption += description + '\n';
  if (tags)        caption += tags;

  return caption.trim().slice(0, 2200); // limite TikTok
}

function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── Vérifier la connexion TikTok ────── */
async function verifierConnexion() {
  try {
    const response = await axios.get(`${TIKTOK_API}/user/info/`, {
      headers: { 'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` },
      params:  { fields: 'display_name,follower_count' }
    });
    return { connecte: true, utilisateur: response.data?.data?.user };
  } catch (err) {
    return { connecte: false, erreur: err.response?.data || err.message };
  }
}

module.exports = { publierVideo, verifierConnexion };
