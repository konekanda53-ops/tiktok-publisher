// Génère le motif "bogolan" (bandes tissées, signature visuelle du site)
// utilisé comme séparateur entre les sections.
function dessinerBogolan(conteneur) {
  const largeurUnite = 20;
  const nombreUnites = 54;
  const ns = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${nombreUnites * largeurUnite} 18`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "bogolan");
  svg.setAttribute("aria-hidden", "true");

  for (let i = 0; i < nombreUnites; i++) {
    const x = i * largeurUnite;

    const trait = document.createElementNS(ns, "rect");
    trait.setAttribute("x", x + 2);
    trait.setAttribute("y", 8);
    trait.setAttribute("width", 10);
    trait.setAttribute("height", 2);
    trait.setAttribute("fill", "#D4A017");
    trait.setAttribute("opacity", "0.5");
    svg.appendChild(trait);

    if (i % 3 === 0) {
      const point = document.createElementNS(ns, "circle");
      point.setAttribute("cx", x + 7);
      point.setAttribute("cy", 4);
      point.setAttribute("r", 2);
      point.setAttribute("fill", "#B6452C");
      point.setAttribute("opacity", "0.6");
      svg.appendChild(point);
    }

    if (i % 4 === 1) {
      const carre = document.createElementNS(ns, "rect");
      carre.setAttribute("x", x + 5);
      carre.setAttribute("y", 13);
      carre.setAttribute("width", 4);
      carre.setAttribute("height", 4);
      carre.setAttribute("fill", "#D4A017");
      carre.setAttribute("opacity", "0.3");
      svg.appendChild(carre);
    }
  }

  conteneur.innerHTML = "";
  conteneur.appendChild(svg);
}

document.querySelectorAll("[data-bogolan]").forEach(dessinerBogolan);
