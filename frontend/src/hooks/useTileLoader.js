// Chargement incrémental des équipements par tuiles.
//
// Principe :
//  - la carte est découpée en tuiles à un zoom fixe (TILE_ZOOM) ;
//  - loadedTiles : Map<clé_filtres, Set<tileId>> = tuiles déjà chargées pour ces filtres ;
//  - features    : Map<id, feature>              = équipements déjà reçus (pas de doublon) ;
//  - à chaque "moveend", on ne demande que les tuiles visibles non encore chargées,
//    regroupées en rectangles (une requête in_bbox par rectangle) ;
//  - si une réponse atteint la limite du back (5000), on recoupe le rectangle en deux ;
//  - un changement de filtres vide le cache ; les requêtes obsolètes sont annulées
//    (AbortController) ;
//  - sous MIN_ZOOM on ne charge rien.
import { useEffect, useRef, useState } from "react";
import { fetchEquipements } from "../api";
import { filterKey } from "../utils/filters";
import { groupTiles, rectTileIds, rectToBBox, splitRect, visibleTiles } from "../utils/tiles";

export const TILE_ZOOM = 12;
export const MIN_ZOOM = 10;
const MAX_FEATURES = 5000; // = BPE_MAX_FEATURES côté back
const CONCURRENCY = 4; // requêtes simultanées max

const EMPTY = { type: "FeatureCollection", features: [] };

export function useTileLoader(map, sourceId, filterParams) {
  const loadedTiles = useRef(new Map());
  const features = useRef(new Map());
  const controller = useRef(null);
  const paramsRef = useRef(filterParams);
  const [status, setStatus] = useState({ loading: false, zoomTooLow: false, count: 0, error: null });

  const key = filterKey(filterParams);
  paramsRef.current = filterParams;

  useEffect(() => {
    if (!map) return;

    // Nouveaux filtres => on repart de zéro
    controller.current?.abort();
    loadedTiles.current.clear();
    features.current.clear();
    map.getSource(sourceId)?.setData(EMPTY);

    function pushToMap() {
      map.getSource(sourceId)?.setData({ type: "FeatureCollection", features: [...features.current.values()] });
      setStatus((s) => ({ ...s, count: features.current.size }));
    }

    // Charge un rectangle de tuiles ; recoupe si la réponse est tronquée
    async function loadRect(rect, signal, loaded) {
      const data = await fetchEquipements(rectToBBox(rect, TILE_ZOOM), paramsRef.current, signal);
      const single = rect.x0 === rect.x1 && rect.y0 === rect.y1;
      // Le back peut signaler explicitement une réponse tronquée ("truncated": true)
      const truncated = data.truncated ?? data.features.length >= MAX_FEATURES;
      if (truncated && !single) {
        const [a, b] = splitRect(rect);
        await loadRect(a, signal, loaded);
        await loadRect(b, signal, loaded);
        return;
      }
      if (signal.aborted) return;
      for (const f of data.features) {
        // djangorestframework-gis place l'id au niveau de la feature : on le recopie
        // dans properties pour le retrouver au clic (le clustering ne garde que properties)
        const id = f.id ?? f.properties.id;
        f.properties.id = id;
        features.current.set(id, f);
      }
      rectTileIds(rect, TILE_ZOOM).forEach((id) => loaded.add(id));
      pushToMap();
    }

    async function loadVisible() {
      if (map.getZoom() < MIN_ZOOM) {
        controller.current?.abort();
        setStatus((s) => ({ ...s, loading: false, zoomTooLow: true }));
        return;
      }
      if (!loadedTiles.current.has(key)) loadedTiles.current.set(key, new Set());
      const loaded = loadedTiles.current.get(key);

      const missing = visibleTiles(map.getBounds(), TILE_ZOOM).filter((t) => !loaded.has(t.id));
      if (missing.length === 0) {
        setStatus((s) => ({ ...s, loading: false, zoomTooLow: false, error: null }));
        return;
      }

      // La vue a changé : les requêtes précédentes ne servent plus
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setStatus((s) => ({ ...s, loading: true, zoomTooLow: false, error: null }));

      const queue = groupTiles(missing);
      const worker = async () => {
        while (queue.length && !ctrl.signal.aborted) await loadRect(queue.shift(), ctrl.signal, loaded);
      };
      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        if (!ctrl.signal.aborted) setStatus((s) => ({ ...s, loading: false }));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setStatus((s) => ({ ...s, loading: false, error: err.message }));
      }
    }

    loadVisible();
    map.on("moveend", loadVisible);
    return () => {
      map.off("moveend", loadVisible);
      controller.current?.abort();
    };
  }, [map, sourceId, key]);

  return status;
}
