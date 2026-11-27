// Couleur des points par domaine BPE (A, B, C, ...).
export const DOMAINE_COLORS = {
  A: "#2563eb", // Services aux particuliers
  B: "#dc2626", // Commerces
  C: "#f59e0b", // Enseignement
  D: "#16a34a", // Santé et action sociale
  E: "#7c3aed", // Transports et déplacements
  F: "#db2777", // Sports, loisirs et culture
  G: "#0891b2", // Tourisme
};
export const DEFAULT_COLOR = "#6b7280";

export function domaineColor(code) {
  return DOMAINE_COLORS[code] || DEFAULT_COLOR;
}

/** Expression MapLibre : couleur selon la propriété "domaine" de la feature. */
export function domaineColorExpression() {
  const pairs = Object.entries(DOMAINE_COLORS).flat();
  return ["match", ["get", "domaine"], ...pairs, DEFAULT_COLOR];
}
