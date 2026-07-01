const API_BASE = "https://open.tiktokapis.com/v2";

// Étape obligatoire avant CHAQUE publication : TikTok exige de connaître
// les options de confidentialité actuelles du créateur (elles peuvent changer).
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
  // data.data contient : creator_username, creator_nickname, privacy_level_options,
  // comment_disabled, duet_disabled, stitch_disabled, max_video_post_duration_sec
}

// Lance une publication directe à partir d'une URL de vidéo hébergée sur un
// domaine que tu as VÉRIFIÉ dans le portail développeur TikTok.
export async function publierVideoDepuisUrl({
  accessToken,
  videoUrl,
  titre,
  privacyLevel, // doit faire partie de privacy_level_options renvoyé par creator_info
  desactiverCommentaire = false,
  desactiverDuet = false,
  desactiverStitch = false,
}) {
  const reponse = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: titre,
        privacy_level: privacyLevel,
        disable_comment: desactiverCommentaire,
        disable_duet: desactiverDuet,
        disable_stitch: desactiverStitch,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    }),
  });
  const data = await reponse.json();
  if (data.error?.code !== "ok") throw new Error(data.error?.message || "Erreur publish/video/init");
  return data.data; // { publish_id }
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
  return data.data; // { status, publicaly_available_post_id, fail_reason, ... }
}
