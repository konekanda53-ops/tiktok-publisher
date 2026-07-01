import crypto from "crypto";

// TikTok exige PKCE (Proof Key for Code Exchange) en plus de l'OAuth2 classique.
// On génère un "code_verifier" secret et son empreinte SHA256 ("code_challenge").

export function genererPKCE() {
  const verifier = crypto.randomBytes(32).toString("hex");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function genererState() {
  return crypto.randomBytes(16).toString("hex");
}

export function construireUrlAutorisation({ clientKey, redirectUri, state, codeChallenge }) {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  // Scopes nécessaires : info de base + publication directe.
  // "video.publish" doit être explicitement approuvé pour ton app dans le portail développeur.
  url.searchParams.set("scope", "user.info.basic,video.publish");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function echangerCodeContreToken({ clientKey, clientSecret, code, redirectUri, codeVerifier }) {
  const reponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const data = await reponse.json();
  if (data.error) throw new Error(`Erreur OAuth TikTok : ${data.error_description || data.error}`);
  return data; // { access_token, refresh_token, expires_in, open_id, ... }
}

export async function rafraichirToken({ clientKey, clientSecret, refreshToken }) {
  const reponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await reponse.json();
  if (data.error) throw new Error(`Erreur de rafraîchissement : ${data.error_description || data.error}`);
  return data;
}
