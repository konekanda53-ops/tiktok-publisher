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

    elAvatar.src = data.creator_avatar_url || "";
    elNomCreateur.textContent = data.creator_nickname || "Créateur";
    elPseudoCreateur.textContent = "@" + (data.creator_username || "inconnu");
    elInfoLimiteVideo.textContent = `Durée max. autorisée : ${data.max_video_post_duration_sec || "?"} s`;

    elEtatNonConnecte.classList.add("cache");
    elEtatConnecte.classList.remove("cache");

    remplirOptionsConfidentialite(data.privacy_level_options || []);
    elBtnPublier.disabled = false;

    elPointStatut.classList.add("connecte");
    elTexteStatutSidebar.textContent = "@" + (data.creator_username || "connecté");
    elResumeCompte.textContent = "@" + (data.creator_username || "connecté");
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

function remplirOptionsConfidentialite(options) {
  elChampConfidentialite.innerHTML = "";
  const libelles = {
    PUBLIC_TO_EVERYONE: "Public",
    MUTUAL_FOLLOW_FRIENDS: "Amis (abonnements mutuels)",
    SELF_ONLY: "Privé (visible par toi uniquement)",
  };
  options.forEach((valeur) => {
    const option = document.createElement("option");
    option.value = valeur;
    option.textContent = libelles[valeur] || valeur;
    elChampConfidentialite.appendChild(option);
  });
  if (options.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Aucune option disponible";
    elChampConfidentialite.appendChild(option);
  }
}

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

function afficherResultatScript(data) {
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
}

function escapeHtml(texte) {
  const div = document.createElement("div");
  div.textContent = texte;
  return div.innerHTML;
}

// =========================================================
// Publication
// =========================================================
const elFormulaire = document.getElementById("formulaire-publication");
const elChampUrl = document.getElementById("champ-url");
const elChampTitre = document.getElementById("champ-titre");
const elCompteurTitre = document.getElementById("compteur-titre");
const elChampConfidentialite = document.getElementById("champ-confidentialite");
const elCaseCommentaire = document.getElementById("case-commentaire");
const elCaseDuet = document.getElementById("case-duet");
const elCaseStitch = document.getElementById("case-stitch");
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
  elBtnPublier.disabled = true;
  elBtnPublier.textContent = "Publication en cours…";

  const openId = obtenirOpenId();
  const corps = {
    openId,
    videoUrl: elChampUrl.value.trim(),
    titre: elChampTitre.value.trim(),
    privacyLevel: elChampConfidentialite.value,
    desactiverCommentaire: elCaseCommentaire.checked,
    desactiverDuet: elCaseDuet.checked,
    desactiverStitch: elCaseStitch.checked,
  };

  try {
    const reponse = await fetch(`${API_BASE}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || "Échec de la publication.");

    ajouterPublicationASuivre({ publishId: data.publishId, titre: corps.titre, openId });
    compteurPublications += 1;
    elResumePublications.textContent = String(compteurPublications);

    elFormulaire.reset();
    elCompteurTitre.textContent = "0 / 2200";
  } catch (e) {
    elErreurPublication.textContent = e.message;
    elErreurPublication.classList.remove("cache");
  } finally {
    elBtnPublier.disabled = false;
    elBtnPublier.textContent = "Publier la vidéo";
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
        elBadge.textContent = "Publiée";
        elBadge.className = "badge badge-succes";
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
