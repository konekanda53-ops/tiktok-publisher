const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Construit le prompt envoyé au modèle pour obtenir un contenu TikTok complet.
function construirePrompt({ categorie, sujet, duree, langue }) {
  return `Tu es l'assistant créatif de "TikTok IA Studio", spécialisé dans le contenu viral d'histoire et de culture pour TikTok, en particulier l'histoire africaine et mondiale.

Catégorie : ${categorie}
${sujet ? `Sujet précis demandé par l'utilisateur : ${sujet}` : "Aucun sujet précis : choisis un sujet fascinant et peu connu dans cette catégorie."}
Durée de la vidéo : ${duree}
Langue : ${langue}

Génère un contenu prêt à publier. Réponds UNIQUEMENT avec un objet JSON valide (sans \`\`\`json, sans texte avant ou après), avec exactement ces clés :
{
  "idee": "une accroche/sujet de vidéo en une phrase percutante",
  "script": "le script complet de la vidéo, adapté à la durée demandée, avec un hook fort dans les 3 premières secondes, écrit pour être lu à voix haute, sans indications de mise en scène",
  "titre": "un titre/légende TikTok accrocheur avec si besoin un emoji pertinent et 3-4 hashtags inclus à la fin",
  "description_seo": "une description optimisée SEO de 1 à 2 phrases",
  "hashtags": ["liste", "de", "8", "à", "10", "hashtags", "pertinents", "sans", "le", "symbole dièse"],
  "conseil": "un conseil court de publication (créneau horaire, format, ou bonne pratique) cohérent avec la catégorie"
}

Important : vérifie la plausibilité historique des faits avancés et reste factuel ; si un détail est incertain, formule-le avec prudence plutôt que de l'affirmer.`;
}

export async function genererContenuIA({ apiKey, categorie, sujet, duree, langue, modele = "claude-sonnet-5" }) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquante : ajoute-la dans ton fichier .env");
  }

  const reponse = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modele,
      max_tokens: 1200,
      messages: [{ role: "user", content: construirePrompt({ categorie, sujet, duree, langue }) }],
    }),
  });

  const data = await reponse.json();
  if (data.error) throw new Error(data.error.message || "Erreur API Anthropic");

  const texte = (data.content || [])
    .map((bloc) => (bloc.type === "text" ? bloc.text : ""))
    .filter(Boolean)
    .join("\n");

  const nettoye = texte.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(nettoye);
  } catch {
    throw new Error("Réponse du modèle non interprétable en JSON. Réessaie.");
  }
}
