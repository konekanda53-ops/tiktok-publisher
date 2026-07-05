const API_BASE = "https://open.tiktokapis.com/v2";

// Infos du créateur connecté (pseudo, avatar...). Utilisé pour affichage,
// pas indispensable en mode brouillon (pas de privacy_level à choisir).
export async function recupererInfosCreateur(accessToken) {
  const reponse = await fetch(`${API_BASE}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const data = await reponse.json();
  if (data.error?.code !== "ok") throw new Error(data.error?.message || "Erreur creator_info");
  return data.data;
}

// Étape 1 : ouvre un envoi de brouillon TikTok (scope "video.upload").
// La vidéo est envoyée en octets directement à TikTok (FILE_UPLOAD), donc
// aucune vérification de domaine n'est nécessaire (contrairement à PULL_FROM_URL).
// TikTok répond avec une "upload_url" à laquelle envoyer le fichier.
export async function initierBrouillonParFichier({ accessToken, tailleOctets }) {
  const reponse = await fetch(`${API_BASE}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: tailleOctets,
        chunk_size: tailleOctets,
        total_chunk_count: 1,
      },
    }),
  });
  const data = await reponse.json();
  if (data.error?.code !== "ok") throw new Error(data.error?.message || "Erreur inbox/video/init");
  return data.data; // { publish_id, upload_url }
}

// Étape 2 : envoie les octets de la vidéo à l'URL fournie par TikTok.
export async function envoyerFichierVersTikTok({ uploadUrl, buffer }) {
  const reponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!reponse.ok) {
    const texte = await reponse.text().catch(() => "");
    throw new Error(`Échec de l'envoi du fichier vidéo (${reponse.status}) ${texte}`);
  }
}

// À appeler en polling (toutes les 2-3s) jusqu'à PUBLISH_COMPLETE ou FAILED.
export async function verifierStatutPublication({ accessToken, publishId }) {
  const reponse = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = await reponse.json();
  if (data.error?.code !== "ok") throw new Error(data.error?.message || "Erreur status/fetch");
  return data.data; // { status, fail_reason, ... }
}
