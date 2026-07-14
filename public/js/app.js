/* ═══════════════════════════════════════
   TIKTOK IA STUDIO V2 — app.js
   Frontend sans undefined
   Progression en temps réel (SSE)
═══════════════════════════════════════ */

/* ── État global ─────────────────────── */
let sessionId    = null;
let sseSource    = null;
let enCours      = false;

/* ── Map étapes → éléments DOM ──────── */
const ETAPES_MAP = {
  ia:      'step-ia',
  ia_ok:   'step-ia',
  voix:    'step-voix',
  voix_ok: 'step-voix',
  images:  'step-images',
  images_ok:'step-images',
  subs:    'step-subs',
  subs_ok: 'step-subs',
  video:   'step-video',
  video_ok:'step-video',
  tiktok:  'step-tiktok',
  tiktok_ok:'step-tiktok'
};

/* ── Init ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  verifierTikTok();
  chargerVideos();

  // Afficher l'étape TikTok si la case est cochée
  document.getElementById('publier').addEventListener('change', e => {
    document.getElementById('step-tiktok').style.display = e.target.checked ? '' : 'none';
  });
});

/* ── Vérifier la connexion TikTok ────── */
async function verifierTikTok() {
  try {
    const res  = await fetch('/api/tiktok/status');
    const data = await res.json();
    const dot  = document.querySelector('.tiktok-status .dot');
    const txt  = document.querySelector('.status-text');

    if (data.connecte) {
      dot.classList.add('connected');
      txt.textContent = data.utilisateur?.display_name
        ? `TikTok : ${data.utilisateur.display_name}`
        : 'TikTok connecté';
    } else {
      dot.classList.add('disconnected');
      txt.textContent = 'TikTok non connecté';
    }
  } catch (_) {
    document.querySelector('.status-text').textContent = 'TikTok non configuré';
  }
}

/* ── Lancer la génération ────────────── */
async function lancerGeneration() {
  if (enCours) return;

  const sujet = document.getElementById('sujet').value.trim();
  if (!sujet) {
    secoulerInput('sujet');
    return;
  }

  enCours   = true;
  sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Afficher la progression, cacher les résultats
  document.getElementById('progress-card').classList.remove('hidden');
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('btn-generer').disabled = true;
  document.getElementById('btn-generer').innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">⏳</span> Génération en cours...';

  // Réinitialiser les étapes
  reinitEtapes();

  // Ouvrir le canal SSE
  connecterSSE(sessionId);

  // Envoyer la requête
  try {
    const response = await fetch('/api/generer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sujet,
        duree:     parseInt(document.getElementById('duree').value),
        langue:    document.getElementById('langue').value,
        style:     document.getElementById('style').value,
        publier:   document.getElementById('publier').checked,
        sessionId
      })
    });

    if (!response.ok) {
      const err = await response.json();
      afficherErreur(err.erreur || 'Erreur serveur');
    }
  } catch (err) {
    afficherErreur('Impossible de contacter le serveur : ' + err.message);
  }
}

/* ── Connexion SSE ───────────────────── */
function connecterSSE(sid) {
  if (sseSource) sseSource.close();

  sseSource = new EventSource(`/api/progression/${sid}`);

  sseSource.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      traiterEvenement(data);
    } catch (_) { /* heartbeat ou message non JSON */ }
  };

  sseSource.onerror = () => {
    if (sseSource.readyState === EventSource.CLOSED && enCours) {
      console.warn('[SSE] Connexion fermée');
    }
  };
}

/* ── Traiter un événement SSE ────────── */
function traiterEvenement(data) {
  const { etape, message, pct } = data;

  // Mettre à jour la barre de progression
  if (pct !== undefined) {
    setProgression(pct);
  }

  // Mettre à jour les étapes
  const stepId = ETAPES_MAP[etape];
  if (stepId) {
    const estOk = etape.endsWith('_ok');
    marquerEtape(stepId, estOk ? 'done' : 'active', message);
  }

  // Cas spéciaux
  switch (etape) {

    case 'ia_ok':
      // Afficher les infos du script dès qu'elles arrivent
      document.getElementById('res-titre').textContent =
        data.titre ?? 'Titre en cours de génération...';
      document.getElementById('res-description').textContent =
        data.description ?? '';
      document.getElementById('res-script').textContent =
        data.script ?? '';
      afficherHashtags(data.hashtags ?? []);
      break;

    case 'video_ok':
      if (data.fichier) {
        document.getElementById('btn-download').href = data.fichier;
        document.getElementById('btn-download').download =
          data.fichier.split('/').pop() || 'video.mp4';
      }
      break;

    case 'tiktok_ok':
      if (data.lien) {
        const lienDiv = document.getElementById('tiktok-link');
        document.getElementById('tiktok-lien-url').href = data.lien;
        lienDiv.classList.remove('hidden');
      }
      break;

    case 'termine':
      terminer();
      break;

    case 'erreur':
      afficherErreur(message);
      break;
  }
}

/* ── Terminer la génération ──────────── */
function terminer() {
  enCours = false;
  if (sseSource) { sseSource.close(); sseSource = null; }

  document.getElementById('btn-generer').disabled = false;
  document.getElementById('btn-generer').innerHTML = `
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Générer la vidéo`;

  document.getElementById('result-card').classList.remove('hidden');

  // Recharger la liste des vidéos
  chargerVideos();

  // Scroll vers le résultat
  setTimeout(() => {
    document.getElementById('result-card').scrollIntoView({ behavior: 'smooth' });
  }, 200);
}

/* ── Afficher une erreur ─────────────── */
function afficherErreur(msg) {
  enCours = false;
  if (sseSource) { sseSource.close(); sseSource = null; }

  const box = document.getElementById('error-box');
  document.getElementById('error-msg').textContent = msg || 'Une erreur inattendue s\'est produite.';
  box.classList.remove('hidden');

  document.getElementById('btn-generer').disabled = false;
  document.getElementById('btn-generer').innerHTML = `
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Réessayer`;
}

/* ── Helpers DOM ─────────────────────── */
function setProgression(pct) {
  const val = Math.min(100, Math.max(0, pct));
  document.getElementById('progress-fill').style.width = val + '%';
  document.getElementById('progress-pct').textContent  = Math.round(val) + '%';
}

function marquerEtape(stepId, etat, message) {
  const stepEl  = document.getElementById(stepId);
  const dotEl   = stepEl?.querySelector('.step-dot');
  const statEl  = document.getElementById(stepId + '-status');

  if (!stepEl) return;

  // Supprimer les classes précédentes
  stepEl.classList.remove('active', 'done', 'erreur');
  dotEl?.classList.remove('pending', 'active', 'done', 'erreur');

  stepEl.classList.add(etat);
  dotEl?.classList.add(etat);

  if (statEl && message) statEl.textContent = message;

  // Icône dans le point
  if (dotEl) {
    if (etat === 'done')   dotEl.textContent = '✓';
    else if (etat === 'erreur') dotEl.textContent = '✕';
    else                   dotEl.textContent = '';
  }
}

function afficherHashtags(hashtags) {
  const container = document.getElementById('res-hashtags');
  if (!hashtags || hashtags.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = hashtags
    .map(h => `<span class="hashtag">${h}</span>`)
    .join('');
}

function reinitEtapes() {
  ['step-ia','step-voix','step-images','step-subs','step-video','step-tiktok'].forEach(id => {
    const el  = document.getElementById(id);
    const dot = el?.querySelector('.step-dot');
    if (el) el.classList.remove('active','done','erreur');
    if (dot) { dot.className = 'step-dot pending'; dot.textContent = ''; }
    const stat = document.getElementById(id + '-status');
    if (stat) stat.textContent = 'En attente';
  });
  setProgression(0);
}

function secoulerInput(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'var(--error)';
  el.focus();
  setTimeout(() => el.style.borderColor = '', 2000);
}

/* ── Nouvelle vidéo ──────────────────── */
function nouvelleVideo() {
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('progress-card').classList.add('hidden');
  document.getElementById('tiktok-link').classList.add('hidden');
  document.getElementById('sujet').value = '';
  document.getElementById('sujet').focus();
  reinitEtapes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Charger la liste des vidéos ─────── */
async function chargerVideos() {
  try {
    const res    = await fetch('/api/videos');
    const data   = await res.json();
    const videos = data.videos ?? [];

    const container = document.getElementById('videos-list');

    if (videos.length === 0) {
      container.innerHTML = '<div class="empty-state">Aucune vidéo encore générée.</div>';
      return;
    }

    container.innerHTML = videos.map(v => `
      <div class="video-item">
        <div class="video-icon">🎬</div>
        <div class="video-info">
          <div class="video-nom">${v.nom ?? 'Vidéo sans nom'}</div>
          <div class="video-meta">
            ${formaterTaille(v.taille ?? 0)} ·
            ${formaterDate(v.date)}
          </div>
        </div>
        <a class="video-dl" href="${v.url ?? '#'}" download>
          ↓ Télécharger
        </a>
      </div>`).join('');

  } catch (err) {
    console.warn('[Videos] Erreur chargement :', err.message);
  }
}

/* ── Utilitaires ─────────────────────── */
function formaterTaille(octets) {
  if (!octets) return '—';
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

function formaterDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return '—'; }
}

/* ── Animation spin (pour le bouton) ── */
const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);
