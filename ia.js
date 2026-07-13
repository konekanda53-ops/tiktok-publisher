const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function construirePrompt({ categorie, sujet, duree, langue }) {
  return `Tu es l'assistant créatif de TikTok IA Studio, spécialisé dans du contenu d'histoire et de culture pour TikTok.

Catégorie : ${categorie}
Sujet : ${sujet || "Libre : choisis un sujet fascinant et peu connu dans cette catégorie"}
Durée de la vidéo : ${duree}
Langue : ${langue}

Écris un script adapté à la durée demandée, avec un hook fort dans les 3 premières secondes, écrit pour être lu à voix haute.
Vérifie la plausibilité historique des faits avancés ; si un détail est incertain, formule-le avec prudence plutôt que de l'affirmer.

Ajoute aussi 4 à 6 mots-clés VISUELS GÉNÉRIQUES en anglais (pour une recherche
dans une banque de photos), par exemple "ancient african market", "gold
caravan desert", "medieval king throne". Ces mots-clés doivent décrire des
scènes ou objets visuels génériques et INTERCHANGEABLES : jamais de noms
propres ni de personnages précis (une banque de photos généraliste n'a pas
d'images de personnages ou d'événements historiques spécifiques).`;
}

// Un script de 3 minutes fait ~450-600 mots : sans assez de tokens de sortie,
// la réponse JSON est tronquée en plein milieu et le parsing échoue. On
// adapte donc la limite à la durée demandée.
function maxTokensPourDuree(duree) {
  const valeur = String(duree || "").toLowerCase();

  if (valeur.includes("3 min")) return 8192;
  if (valeur.includes("2 min")) return 4096;
  if (valeur.includes("1 min")) return 2048;

  return 1536;
}

// Schéma strict : force Gemini à renvoyer "script" comme une VRAIE chaîne de
// caractères (jamais un tableau ou un objet), ce qui évite les plantages en
// aval (ex. "texte.trim is not a function" dans voice.js).
const SCHEMA_REPONSE = {
  type: "OBJECT",
  properties: {
    idee: { type: "STRING" },
    script: { type: "STRING" },
    titre: { type: "STRING" },
    description_seo: { type: "STRING" },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
    conseil: { type: "STRING" },
    visual_keywords: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["idee", "script", "titre", "description_seo", "hashtags", "conseil", "visual_keywords"],
};

export async function genererContenuIA({ apiKey, categorie, sujet, duree, langue }) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY manquante");
  }

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: construirePrompt({ categorie, sujet, duree, langue }) }] }],
      generationConfig: {
  responseMimeType: "application/json",
  maxOutputTokens: maxTokensPourDuree(duree),
},
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }

 const candidat = data.candidates?.[0];

console.log("===== REPONSE GEMINI =====");
console.log(JSON.stringify(data, null, 2));
console.log("==========================");

if (!candidat) {
  throw new Error("Aucune réponse du modèle.");
}

console.log("FinishReason :", candidat.finishReason);

if (candidat.finishReason === "MAX_TOKENS") {
  throw new Error(
    "Le script a dépassé la longueur maximale avant d'être complet. Essaie une durée plus courte, ou réessaie."
  );
}

  const texte = candidat.content?.parts?.[0]?.text || "";

  let contenu;
  try {
    contenu = JSON.parse(texte);
  } catch {
    throw new Error("Réponse du modèle non interprétable en JSON. Réessaie.");
  }

  // Filet de sécurité supplémentaire, même avec un schéma strict.
  if (Array.isArray(contenu.script)) contenu.script = contenu.script.join("\n\n");
  if (typeof contenu.script !== "string") contenu.script = String(contenu.script ?? "");
  if (!Array.isArray(contenu.hashtags)) contenu.hashtags = [];
  if (!Array.isArray(contenu.visual_keywords)) contenu.visual_keywords = [];

  if (!contenu.script.trim()) {
    throw new Error("Le modèle n'a renvoyé aucun script exploitable. Réessaie.");
  }

  return contenu;
}
