const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function construirePrompt({ categorie, sujet, duree, langue }) {
  return `
Tu es l'assistant créatif de TikTok IA Studio.

Catégorie : ${categorie}
Sujet : ${sujet || "Libre"}
Durée : ${duree}
Langue : ${langue}

Réponds uniquement avec un JSON :

{
  "idee":"",
  "script":"",
  "titre":"",
  "description_seo":"",
  "hashtags":[],
  "conseil":""
}
`;
}

export async function genererContenuIA({
  apiKey,
  categorie,
  sujet,
  duree,
  langue,
}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY manquante");
  }

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: construirePrompt({
                categorie,
                sujet,
                duree,
                langue,
              }),
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  const texte =
    data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const nettoye = texte.replace(/```json|```/g, "").trim();

  return JSON.parse(nettoye);
}