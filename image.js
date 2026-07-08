const MODELE_IMAGE = "gemini-3.1-flash-image-preview";

export async function genererImage({ apiKey, prompt }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_IMAGE}:generateContent?key=${apiKey}`;

  const reponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  const data = await reponse.json();
  if (data.error) throw new Error(data.error.message || "Erreur génération image");

  const partieImage = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!partieImage) throw new Error("Aucune image renvoyée par le modèle.");

  return Buffer.from(partieImage.inlineData.data, "base64"); // PNG
}

// Découpe le script généré en quelques scènes (phrases regroupées) et génère
// une illustration par scène. Les images sont volontairement demandées SANS
// texte incrusté (le texte généré par les modèles d'image est peu fiable).
export async function genererImagesPourScript({ apiKey, idee, script, nombreImages = 4 }) {
  const phrases = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const tailleGroupe = Math.max(1, Math.ceil(phrases.length / nombreImages));

  const scenes = [];
  for (let i = 0; i < phrases.length && scenes.length < nombreImages; i += tailleGroupe) {
    scenes.push(phrases.slice(i, i + tailleGroupe).join(" "));
  }
  if (scenes.length === 0) scenes.push(idee);

  const images = [];
  for (const scene of scenes) {
    const prompt = `Illustration cinématographique de style peinture numérique historique, cadrage vertical 9:16, sans aucun texte ni lettrage incrusté. Contexte général : ${idee}. Scène précise à illustrer : ${scene}`;
    images.push(await genererImage({ apiKey, prompt }));
  }
  return images;
}
