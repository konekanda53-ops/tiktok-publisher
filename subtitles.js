// Découpe un texte en courtes légendes façon TikTok (quelques mots à la
// fois) et génère un fichier de sous-titres au format ASS, avec un minutage
// réparti au prorata du nombre de caractères de chaque légende par rapport
// à la durée totale de l'audio.
//
// Remarque honnête : c'est une approximation, pas un véritable alignement
// forcé sur l'audio (qui nécessiterait un outil de reconnaissance vocale
// pour retrouver le timing exact de chaque mot). Le résultat reste lisible
// et globalement synchronisé, mais le calage peut légèrement dériver sur
// les textes longs ou aux débits de parole très irréguliers.

const MOTS_PAR_LEGENDE = 5;
const DUREE_MIN_LEGENDE = 0.6; // secondes, pour rester lisible

function decouperEnLegendes(texte) {
  const mots = texte.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const legendes = [];
  for (let i = 0; i < mots.length; i += MOTS_PAR_LEGENDE) {
    legendes.push(mots.slice(i, i + MOTS_PAR_LEGENDE).join(" "));
  }
  return legendes.length ? legendes : [texte];
}

function formaterTemps(secondes) {
  const bornee = Math.max(0, secondes);
  const h = Math.floor(bornee / 3600);
  const m = Math.floor((bornee % 3600) / 60);
  const s = bornee % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function echapperAss(texte) {
  return texte.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, " ");
}

// Construit le contenu d'un fichier .ass : texte en gras, blanc, contour
// noir épais, centré dans le tiers inférieur — le style TikTok classique.
export function genererAss({ texte, dureeTotale }) {
  const legendes = decouperEnLegendes(texte);
  const totalCaracteres = legendes.reduce((somme, l) => somme + l.length, 0) || 1;

  let curseur = 0;
  const lignes = [];
  for (const legende of legendes) {
    const part = legende.length / totalCaracteres;
    const duree = Math.max(DUREE_MIN_LEGENDE, dureeTotale * part);
    const debut = curseur;
    const fin = Math.min(dureeTotale, curseur + duree);
    lignes.push(
      `Dialogue: 0,${formaterTemps(debut)},${formaterTemps(fin)},Default,,0,0,0,,${echapperAss(legende)}`
    );
    curseur = fin;
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,2,80,80,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lignes.join("\n")}
`;
}
