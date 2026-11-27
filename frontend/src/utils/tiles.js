// Calcul des tuiles visibles (grille « slippy map » type OSM, en WGS84 [lon, lat]).
// On découpe la carte en tuiles à un zoom FIXE : une tuile chargée n'est plus jamais
// redemandée tant que les filtres ne changent pas.

const MAX_LAT = 85.0511; // limite de la projection Web Mercator

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lonToTileX(lon, z) {
  const n = 2 ** z;
  return clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1);
}

export function latToTileY(lat, z) {
  const n = 2 ** z;
  const rad = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return clamp(Math.floor(y), 0, n - 1);
}

export function tileXToLon(x, z) {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Identifiant texte d'une tuile, ex "12/2050/1400". */
export function tileId(x, y, z) {
  return `${z}/${x}/${y}`;
}

/** Liste des tuiles {x, y, id} couvrant les bornes MapLibre (LngLatBounds). */
export function visibleTiles(bounds, z) {
  const minX = lonToTileX(bounds.getWest(), z);
  const maxX = lonToTileX(bounds.getEast(), z);
  const minY = latToTileY(bounds.getNorth(), z); // y croît vers le sud
  const maxY = latToTileY(bounds.getSouth(), z);
  const tiles = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) tiles.push({ x, y, id: tileId(x, y, z) });
  }
  return tiles;
}

/**
 * Bbox [minLon, minLat, maxLon, maxLat] d'un rectangle de tuiles
 * (de x0..x1 et y0..y1 inclus).
 */
export function rectToBBox({ x0, x1, y0, y1 }, z) {
  return [tileXToLon(x0, z), tileYToLat(y1 + 1, z), tileXToLon(x1 + 1, z), tileYToLat(y0, z)];
}

/** Liste des ids de tuiles contenues dans un rectangle. */
export function rectTileIds({ x0, x1, y0, y1 }, z) {
  const ids = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids.push(tileId(x, y, z));
  return ids;
}

/**
 * Regroupe les tuiles manquantes en rectangles pour limiter le nombre de requêtes :
 *  1. sur chaque ligne, on forme des « segments » de tuiles contiguës (largeur max maxWidth) ;
 *  2. on fusionne verticalement les segments identiques des lignes consécutives
 *     (tant que le rectangle ne dépasse pas maxTiles tuiles).
 * Retourne une liste de rectangles {x0, x1, y0, y1}.
 */
export function groupTiles(tiles, { maxWidth = 16, maxTiles = 64 } = {}) {
  // 1. segments par ligne
  const byRow = new Map();
  for (const t of tiles) {
    if (!byRow.has(t.y)) byRow.set(t.y, []);
    byRow.get(t.y).push(t.x);
  }
  const segments = [];
  for (const [y, xs] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i];
      if (x === prev + 1 && x - start < maxWidth) {
        prev = x;
        continue;
      }
      segments.push({ x0: start, x1: prev, y0: y, y1: y });
      start = prev = x;
    }
  }

  // 2. fusion verticale des segments qui ont exactement la même étendue en x
  const rects = [];
  for (const s of segments) {
    const width = s.x1 - s.x0 + 1;
    const r = rects.find(
      (r) =>
        r.x0 === s.x0 &&
        r.x1 === s.x1 &&
        r.y1 === s.y0 - 1 &&
        width * (r.y1 - r.y0 + 2) <= maxTiles
    );
    if (r) r.y1 = s.y0;
    else rects.push({ ...s });
  }
  return rects;
}

/** Coupe un rectangle en deux (selon son plus grand côté). */
export function splitRect(r) {
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  if (w >= h) {
    const mid = r.x0 + Math.floor(w / 2) - 1;
    return [{ ...r, x1: mid }, { ...r, x0: mid + 1 }];
  }
  const mid = r.y0 + Math.floor(h / 2) - 1;
  return [{ ...r, y1: mid }, { ...r, y0: mid + 1 }];
}
