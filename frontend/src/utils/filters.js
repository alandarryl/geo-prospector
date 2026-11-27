// Conversion de la sélection de l'arbre (codes des types cochés) en paramètres d'API.
// L'API combine domaine / sous_domaine / type en OU : on envoie le code le plus
// « haut » possible pour garder des URLs courtes.
//   - domaine entièrement coché      -> domaine=B
//   - sous-domaine entièrement coché -> sous_domaine=B1
//   - sinon                          -> type=B101,B102

export function typesOfSousDomaine(sd) {
  return sd.types.map((t) => t.code);
}

export function typesOfDomaine(d) {
  return d.sous_domaines.flatMap(typesOfSousDomaine);
}

/** "all" | "some" | "none" selon le nombre de codes présents dans selected. */
export function checkState(codes, selected) {
  if (codes.length === 0) return "none";
  const n = codes.filter((c) => selected.has(c)).length;
  if (n === 0) return "none";
  return n === codes.length ? "all" : "some";
}

/**
 * @param domaines arbre renvoyé par /api/domaines/
 * @param selectedTypes Set des codes de types cochés
 * @param communes [{id, nom, departement, bbox}]
 * @returns objet de paramètres pour /api/equipements/
 */
export function buildFilterParams(domaines, selectedTypes, communes) {
  const domaine = [];
  const sousDomaine = [];
  const type = [];
  for (const d of domaines) {
    const st = checkState(typesOfDomaine(d), selectedTypes);
    if (st === "all") {
      domaine.push(d.code);
      continue;
    }
    if (st === "none") continue;
    for (const sd of d.sous_domaines) {
      const sst = checkState(typesOfSousDomaine(sd), selectedTypes);
      if (sst === "all") sousDomaine.push(sd.code);
      else if (sst === "some") sd.types.forEach((t) => selectedTypes.has(t.code) && type.push(t.code));
    }
  }
  const params = {};
  if (domaine.length) params.domaine = domaine.join(",");
  if (sousDomaine.length) params.sous_domaine = sousDomaine.join(",");
  if (type.length) params.type = type.join(",");
  if (communes.length) params.commune = communes.map((c) => c.id).join(",");
  return params;
}

/** Clé stable des filtres (sert de clé de cache). */
export function filterKey(params) {
  return JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
}
