// image.js
export async function genererImagesPourScript({
  apiKey,
  idee,
  script,
  nombreImages = 4,
}) {
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY manquante");
  }

  const phrases = script
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const taille = Math.max(
    1,
    Math.ceil(phrases.length / nombreImages)
  );

  const scenes = [];

  for (let i = 0; i < phrases.length; i += taille) {
    scenes.push(phrases.slice(i, i + taille).join(" "));
    if (scenes.length >= nombreImages) break;
  }

  if (!scenes.length) scenes.push(idee);

  const images = [];

  for (const scene of scenes) {
    const recherche = scene
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(" ")
      .slice(0, 6)
      .join(" ");

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
      recherche
    )}&orientation=portrait&per_page=1`;

    const reponse = await fetch(url, {
      headers: {
        Authorization: apiKey,
      },
    });

    const data = await reponse.json();

    if (!data.photos?.length) {
      throw new Error(`Aucune image trouvée pour : ${recherche}`);
    }

    const imageURL = data.photos[0].src.large2x;

    const image = await fetch(imageURL);

    images.push(Buffer.from(await image.arrayBuffer()));
  }

  return images;
}