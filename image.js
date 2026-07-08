// Utilise Pexels (banque de photos) pour illustrer le script.
//
// Important : Pexels ne contient QUE des photos génériques (pas de photos de
// personnages ou d'événements historiques précis). Chercher "Moussa et ses
// Frères" ne renverra donc jamais rien de pertinent. On privilégie les
// "visual_keywords" génériques renvoyés par l'IA (ia.js) — des descriptions
// de scène en anglais comme "ancient african market" — bien plus efficaces
// qu'un extrait de phrase narrative pour trouver une photo qui correspond.

const PEXELS_URL = "https://api.pexels.com/v1/search";

async function chercherUnePhoto({ apiKey, requete }) {
  const url = `${PEXELS_URL}?query=${encodeURIComponent(requete)}&orientation=portrait&per_page=1`;
  const reponse = await fetch(url, { headers: { Authorization: apiKey } });
  if (!reponse.ok) {
    throw new Error(`Erreur Pexels (${reponse.status}) pour la requête "${requete}".`);
  }
  const data = await reponse.json();
  return data.photos?.[0]?.src?.large2x || null;
}

function nettoyerRequete(texte) {
  return String(texte || "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

// Cherche une photo pour la requête principale, puis retente avec des
// requêtes de secours de plus en plus génériques plutôt que d'abandonner
// tout le montage vidéo à cause d'une seule scène sans résultat.
async function trouverPhotoAvecReplis({ apiKey, requetePrincipale, requeteRepli }) {
  const tentatives = [requetePrincipale, requeteRepli, "ancient history culture"].filter(Boolean);

  for (const requete of tentatives) {
    const url = await chercherUnePhoto({ apiKey, requete });
    if (url) return url;
  }

  throw new Error(
    `Aucune photo trouvée sur Pexels, même avec les requêtes de secours (dernière requête essayée : "${requetePrincipale}").`
  );
}

export async function genererImagesPourScript({
  apiKey,
  idee,
  script,
  motsClesVisuels = [],
  nombreImages = 4,
}) {
  if (!apiKey) {
    throw new Error(
      "PEXELS_API_KEY manquante : crée une clé gratuite sur https://www.pexels.com/api et ajoute-la dans tes variables d'environnement."
    );
  }

  // Priorité aux mots-clés visuels génériques fournis par l'IA.
  let requetes = (motsClesVisuels || []).filter(Boolean).slice(0, nombreImages);

  // Si l'IA n'en a pas fourni assez, on complète avec des extraits de phrase
  // (repli historique, moins fiable mais mieux que rien).
  if (requetes.length < nombreImages) {
    const phrases = script.split(/(?<=[.!?])\s+/).filter(Boolean);
    const taille = Math.max(1, Math.ceil(phrases.length / nombreImages));
    for (let i = 0; i < phrases.length && requetes.length < nombreImages; i += taille) {
      requetes.push(nettoyerRequete(phrases.slice(i, i + taille).join(" ")));
    }
  }
  if (!requetes.length) requetes.push(nettoyerRequete(idee) || "history culture");

  const requeteRepli = nettoyerRequete(idee) || "history culture";

  const images = [];
  for (const requetePrincipale of requetes) {
    const urlImage = await trouverPhotoAvecReplis({ apiKey, requetePrincipale, requeteRepli });
    const image = await fetch(urlImage);
    images.push(Buffer.from(await image.arrayBuffer()));
  }

  return images;
}
