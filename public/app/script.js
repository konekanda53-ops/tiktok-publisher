const API_BASE = window.location.origin;
const CLE_STOCKAGE = "tiktok_open_id";

const CATEGORIES = [
  "Histoire", "Civilisations", "Afrique", "Guerre", "Mythologie",
  "Mystère", "Science", "Animaux", "Espace", "Motivation", "Business", "IA",
];

let categorieChoisie = "Afrique";
let compteurScripts = 0;

// =========================================================
// Navigation par onglets
// =========================================================
const elNavItems = document.querySelectorAll(".nav-item");
const elSections = document.querySelectorAll(".section");

function afficherSection(id) {
  elSections.forEach((s) => s.classList.toggle("actif", s.id === `section-${id}`));
  elNavItems.forEach((b) => b.classList.toggle("actif", b.dataset.section === id));
  window.location.hash = id;
}

elNavItems.forEach((bouton) => {
  bouton.addEventListener("click", () => afficherSection(bouton.dataset.section));
});

document.querySelectorAll(".parcours li").forEach((li) => {
  li.addEventListener("click", () => afficherSection(li.dataset.cible));
});

// =========================================================
// Connexion TikTok
// =========================================================
const elEtatNonConnecte = document.getElementById("etat-non-connecte");
const elEtatConnecte = document.getElementById("etat-connecte");
const elAvatar = document.getElementById("avatar");
const elNomCreateur = document.getElementById("nom-createur");
const elPseudoCreateur = document.getElementById("pseudo-createur");
const elInfoLimiteVideo = document.getElementById("info-limite-video");
const elErreurConnexion = document.getElementById("erreur-connexion");
const elBtnConnecter = document.getElementById("btn-connecter");
const elBtnDeconnecter = document.getElementById("btn-deconnecter");
const elPointStatut = document.getElementById("point-statut");
const elTexteStatutSidebar = document.getElementById("texte-statut-sidebar");
const elResumeCompte = document.getElementById("resume-compte");

function recupererOpenIdDepuisUrl() {
  const params = new URLSearchParams(window.location.search);
  const openId = params.get("openId");
  if (openId) {
    localStorage.setItem(CLE_STOCKAGE, openId);
    window.history.replaceState({}, "", window.location.pathname);
  }
}

function obtenirOpenId() {
  return localStorage.getItem(CLE_STOCKAGE);
}

elBtnConnecter.addEventListener("click", () => {
  window.location.href = `${API_BASE}/auth/tiktok/start`;
});

elBtnDeconnecter.addEventListener("click", () => {
  localStorage.removeItem(CLE_STOCKAGE);
  window.location.reload();
});

async function chargerInfosCreateur() {
  const openId = obtenirOpenId();
  elErreurConnexion.classList.add("cache");

  if (!openId) {
    elEtatNonConnecte.classList.remove("cache");
    elEtatConnecte.classList.add("cache");
    elBtnPublier.disabled = true;
    elPointStatut.classList.remove("connecte");
    elTexteStatutSidebar.textContent = "Non connecté";
    elResumeCompte.textContent = "Non connecté";
    return;
  }

  try {
    const reponse = await fetch(`${API_BASE}/api/creator-info?openId=${encodeURIComponent(openId)}`);
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Impossible de récupérer le compte.");

    if (data.degrade) {
      // Le profil détaillé n'est pas accessible avec le scope actuel, mais le
      // compte est bien connecté : on reste sur un affichage minimal plutôt
      // que d'afficher une erreur bloquante.
      elAvatar.src = "";
      elNomCreateur.textContent = "Compte connecté";
      elPseudoCreateur.textContent = "Profil détaillé indisponible";
      elInfoLimiteVideo.textContent = "";
    } else {
      elAvatar.src = data.creator_avatar_url || "";
      elNomCreateur.textContent = data.creator_nickname || "Créateur";
      elPseudoCreateur.textContent = "@" + (data.creator_username || "inconnu");
      elInfoLimiteVideo.textContent = data.max_video_post_duration_sec
        ? `Durée max. autorisée : ${data.max_video_post_duration_sec} s`
        : "";
    }

    elEtatNonConnecte.classList.add("cache");
    elEtatConnecte.classList.remove("cache");
    elBtnPublier.disabled = false;

    elPointStatut.classList.add("connecte");
    const libelle = data.creator_username ? "@" + data.creator_username : "Connecté";
    elTexteStatutSidebar.textContent = libelle;
    elResumeCompte.textContent = libelle;
  } catch (e) {
    localStorage.removeItem(CLE_STOCKAGE);
    elEtatNonConnecte.classList.remove("cache");
    elEtatConnecte.classList.add("cache");
    elErreurConnexion.textContent = e.message;
    elErreurConnexion.classList.remove("cache");
    elBtnPublier.disabled = true;
    elPointStatut.classList.remove("connecte");
    elTexteStatutSidebar.textContent = "Non connecté";
    elResumeCompte.textContent = "Non connecté";
  }
}

// (Le mode brouillon TikTok ne permet pas de choisir la confidentialité
// depuis l'API : cette option se règle directement dans l'app TikTok.)

// =========================================================
// Script IA
// =========================================================
const elChipsCategorie = document.getElementById("chips-categorie");
const elChampSujet = document.getElementById("champ-sujet");
const elChampDuree = document.getElementById("champ-duree");
const elChampLangue = document.getElementById("champ-langue");
const elBtnGenererScript = document.getElementById("btn-generer-script");
const elErreurScript = document.getElementById("erreur-script");
const elCarteResultatScript = document.getElementById("carte-resultat-script");
const elResumeScripts = document.getElementById("resume-scripts");

CATEGORIES.forEach((cat) => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "chip" + (cat === categorieChoisie ? " actif" : "");
  bouton.textContent = cat;
  bouton.addEventListener("click", () => {
    categorieChoisie = cat;
    elChipsCategorie.querySelectorAll(".chip").forEach((c) => c.classList.toggle("actif", c.textContent === cat));
  });
  elChipsCategorie.appendChild(bouton);
});

elBtnGenererScript.addEventListener("click", async () => {
  elErreurScript.classList.add("cache");
  elBtnGenererScript.disabled = true;
  elBtnGenererScript.textContent = "Génération…";
  elCarteResultatScript.innerHTML = `<div class="resultat-vide"><p class="texte-attenue">L'IA prépare ton contenu…</p></div>`;

  try {
    const reponse = await fetch(`${API_BASE}/api/generate-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categorie: categorieChoisie,
        sujet: elChampSujet.value.trim(),
        duree: elChampDuree.value,
        langue: elChampLangue.value,
      }),
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Échec de la génération.");

    afficherResultatScript(data);
    compteurScripts += 1;
    elResumeScripts.textContent = String(compteurScripts);
  } catch (e) {
    elCarteResultatScript.innerHTML = `<div class="resultat-vide"><p class="texte-attenue">Lance une génération pour voir le résultat ici.</p></div>`;
    elErreurScript.textContent = e.message;
    elErreurScript.classList.remove("cache");
  } finally {
    elBtnGenererScript.disabled = false;
    elBtnGenererScript.textContent = "Générer la vidéo";
  }
});

let dernierResultatScript = null;

function afficherResultatScript(data) {
  dernierResultatScript = data;

  const hashtagsHtml = (data.hashtags || []).map((h) => `<span class="hashtag">#${h}</span>`).join("");
  elCarteResultatScript.innerHTML = `
    <div class="bloc-resultat">
      <div class="bloc-tete"><span class="bloc-label">Idée</span></div>
      <p class="bloc-texte bloc-idee">${escapeHtml(data.idee || "")}</p>
    </div>
    <div class="bloc-resultat">
      <div class="bloc-tete"><span class="bloc-label">Titre</span></div>
      <p class="bloc-texte">${escapeHtml(data.titre || "")}</p>
    </div>
    <div class="bloc-resultat">
      <div class="bloc-tete"><span class="bloc-label">Script</span></div>
      <p class="bloc-texte">${escapeHtml(data.script || "")}</p>
    </div>
    <div class="bloc-resultat">
      <div class="bloc-tete"><span class="bloc-label">Description SEO</span></div>
      <p class="bloc-texte">${escapeHtml(data.description_seo || "")}</p>
    </div>
    <div class="bloc-resultat">
      <div class="bloc-tete"><span class="bloc-label">Hashtags</span></div>
      <div class="hashtags">${hashtagsHtml}</div>
    </div>
    <button type="button" class="bouton bouton-or bouton-large" id="btn-utiliser-script">
      Utiliser pour publier →
    </button>
  `;

  document.getElementById("btn-utiliser-script").addEventListener("click", () => {
    elChampTitre.value = data.titre || "";
    elCompteurTitre.textContent = `${elChampTitre.value.length} / 2200`;
    afficherSection("publication");
  });

  const resume = `Script prêt : "${data.titre || data.idee}"`;
  const elVoixInfo = document.getElementById("voix-source-info");
  const elBtnVoix = document.getElementById("btn-generer-voix");
  if (elVoixInfo) elVoixInfo.textContent = resume;
  if (elBtnVoix) elBtnVoix.disabled = false;

  const elVideoInfo = document.getElementById("video-source-info");
  const elBtnVideoGen = document.getElementById("btn-generer-video");
  if (elVideoInfo) elVideoInfo.textContent = resume;
  if (elBtnVideoGen) elBtnVideoGen.disabled = false;
}

function escapeHtml(texte) {
  const div = document.createElement("div");
  div.textContent = texte;
  return div.innerHTML;
}

// =========================================================
// Voix IA
// =========================================================
const elBtnGenererVoix = document.getElementById("btn-generer-voix");
const elErreurVoix = document.getElementById("erreur-voix");
const elLecteurVoix = document.getElementById("lecteur-voix");

elBtnGenererVoix?.addEventListener("click", async () => {
  if (!dernierResultatScript) return;
  elErreurVoix.classList.add("cache");
  elBtnGenererVoix.disabled = true;
  elBtnGenererVoix.textContent = "Génération de la voix…";

  try {
    const reponse = await fetch(`${API_BASE}/api/generate-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texte: dernierResultatScript.script }),
    });
    if (!reponse.ok) {
      const data = await reponse.json().catch(() => ({}));
      throw new Error(data.erreur || "Échec de la génération de la voix.");
    }
    const blob = await reponse.blob();
    elLecteurVoix.src = URL.createObjectURL(blob);
    elLecteurVoix.classList.remove("cache");
  } catch (e) {
    elErreurVoix.textContent = e.message;
    elErreurVoix.classList.remove("cache");
  } finally {
    elBtnGenererVoix.disabled = false;
    elBtnGenererVoix.textContent = "Générer la voix";
  }
});

// =========================================================
// Génération vidéo automatique (script → voix → images → ffmpeg)
// =========================================================
const elBtnGenererVideo = document.getElementById("btn-generer-video");
const elErreurVideo = document.getElementById("erreur-video");
const elLecteurVideo = document.getElementById("lecteur-video");
const elBtnEnvoyerVideoTikTok = document.getElementById("btn-envoyer-video-tiktok");
let dernierVideoId = null;

elBtnGenererVideo?.addEventListener("click", async () => {
  if (!dernierResultatScript) return;
  elErreurVideo.classList.add("cache");
  elBtnEnvoyerVideoTikTok.classList.add("cache");
  elBtnGenererVideo.disabled = true;
  elBtnGenererVideo.textContent = "Génération en cours… (peut prendre 1 à 2 min)";

  try {
    const reponse = await fetch(`${API_BASE}/api/create-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idee: dernierResultatScript.idee,
        script: dernierResultatScript.script,
        motsClesVisuels: dernierResultatScript.visual_keywords,
      }),
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Échec de la génération vidéo.");

    dernierVideoId = data.videoId;
    elLecteurVideo.src = `${API_BASE}/api/video/${data.videoId}`;
    elLecteurVideo.classList.remove("cache");
    elBtnEnvoyerVideoTikTok.classList.remove("cache");
  } catch (e) {
    elErreurVideo.textContent = e.message;
    elErreurVideo.classList.remove("cache");
  } finally {
    elBtnGenererVideo.disabled = false;
    elBtnGenererVideo.textContent = "Générer la vidéo (voix + images)";
  }
});

elBtnEnvoyerVideoTikTok?.addEventListener("click", async () => {
  if (!dernierVideoId) return;

  const openId = obtenirOpenId();
  if (!openId) {
    elErreurVideo.textContent = "Connecte d'abord ton compte TikTok (onglet Connexion) avant d'envoyer la vidéo.";
    elErreurVideo.classList.remove("cache");
    return;
  }

  elErreurVideo.classList.add("cache");
  elBtnEnvoyerVideoTikTok.disabled = true;
  elBtnEnvoyerVideoTikTok.textContent = "Envoi en cours…";

  try {
    const formData = new FormData();
    formData.append("openId", openId);
    formData.append("videoId", dernierVideoId);

    const reponse = await fetch(`${API_BASE}/api/publish`, { method: "POST", body: formData });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Échec de l'envoi.");

    ajouterPublicationASuivre({
      publishId: data.publishId,
      titre: dernierResultatScript?.titre || "Vidéo générée par l'IA",
      openId,
    });
    compteurPublications += 1;
    elResumePublications.textContent = String(compteurPublications);

    afficherSection("publication");
  } catch (e) {
    elErreurVideo.textContent = e.message;
    elErreurVideo.classList.remove("cache");
  } finally {
    elBtnEnvoyerVideoTikTok.disabled = false;
    elBtnEnvoyerVideoTikTok.textContent = "Envoyer cette vidéo vers TikTok";
  }
});

// =========================================================
// Publication
// =========================================================
const elFormulaire = document.getElementById("formulaire-publication");
const elChampFichier = document.getElementById("champ-fichier");
const elChampTitre = document.getElementById("champ-titre");
const elCompteurTitre = document.getElementById("compteur-titre");
const elBtnPublier = document.getElementById("btn-publier");
const elErreurPublication = document.getElementById("erreur-publication");
const elListePublications = document.getElementById("liste-publications");
const elResumePublications = document.getElementById("resume-publications");

let compteurPublications = 0;

elChampTitre.addEventListener("input", () => {
  elCompteurTitre.textContent = `${elChampTitre.value.length} / 2200`;
});

elFormulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  elErreurPublication.classList.add("cache");

  const fichier = elChampFichier.files[0];
  if (!fichier) {
    elErreurPublication.textContent = "Choisis d'abord un fichier vidéo.";
    elErreurPublication.classList.remove("cache");
    return;
  }

  elBtnPublier.disabled = true;
  elBtnPublier.textContent = "Envoi en cours…";

  const openId = obtenirOpenId();
  const formData = new FormData();
  formData.append("openId", openId);
  formData.append("video", fichier);

  const titrePourAffichage = elChampTitre.value.trim() || fichier.name;

  try {
    const reponse = await fetch(`${API_BASE}/api/publish`, {
      method: "POST",
      body: formData, // pas de Content-Type manuel : le navigateur fixe la boundary multipart
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Échec de l'envoi.");

    ajouterPublicationASuivre({ publishId: data.publishId, titre: titrePourAffichage, openId });
    compteurPublications += 1;
    elResumePublications.textContent = String(compteurPublications);

    elFormulaire.reset();
    elCompteurTitre.textContent = "0 / 2200";
  } catch (e) {
    elErreurPublication.textContent = e.message;
    elErreurPublication.classList.remove("cache");
  } finally {
    elBtnPublier.disabled = false;
    elBtnPublier.textContent = "Envoyer vers TikTok";
  }
});

function ajouterPublicationASuivre({ publishId, titre, openId }) {
  const vide = elListePublications.querySelector(".texte-attenue");
  if (vide) vide.remove();

  const li = document.createElement("li");
  li.className = "publication";
  li.innerHTML = `
    <div class="publication-tete">
      <span class="publication-titre">${escapeHtml(titre || "(sans titre)")}</span>
      <span class="badge badge-en-cours" data-badge>En cours</span>
    </div>
    <div class="publication-meta" data-meta>Démarrage…</div>
  `;
  elListePublications.prepend(li);

  const elBadge = li.querySelector("[data-badge]");
  const elMeta = li.querySelector("[data-meta]");

  const intervalle = setInterval(async () => {
    try {
      const url = `${API_BASE}/api/publish/status?openId=${encodeURIComponent(openId)}&publishId=${encodeURIComponent(publishId)}`;
      const reponse = await fetch(url);
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data.erreur || "Erreur de suivi");

      const statut = data.status;
      elMeta.textContent = `Statut : ${statut}`;

      if (statut === "PUBLISH_COMPLETE") {
        elBadge.textContent = "Envoyée";
        elBadge.className = "badge badge-succes";
        elMeta.textContent = "Vidéo envoyée dans ton app TikTok. Ouvre TikTok pour la publier.";
        clearInterval(intervalle);
      } else if (statut === "FAILED") {
        elBadge.textContent = "Échec";
        elBadge.className = "badge badge-echec";
        elMeta.textContent = `Échec : ${data.fail_reason || "raison inconnue"}`;
        clearInterval(intervalle);
      }
    } catch (e) {
      elMeta.textContent = e.message;
      clearInterval(intervalle);
    }
  }, 2500);
}

// =========================================================
// Démarrage
// =========================================================
recupererOpenIdDepuisUrl();
chargerInfosCreateur();

const sectionInitiale = window.location.hash.replace("#", "") || "dashboard";
afficherSection(document.getElementById(`section-${sectionInitiale}`) ? sectionInitiale : "dashboard");
