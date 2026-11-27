// Carte MapLibre : équipements BPE (chargement incrémental + clustering),
// popups de détail, implantations (repères déplaçables) et mode « ajout ».
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { apiGet } from "../api";
import { MIN_ZOOM, useTileLoader } from "../hooks/useTileLoader";
import { domaineColor, domaineColorExpression } from "../utils/colors";
import EquipementPopup from "./EquipementPopup";
import ImplantationPopup from "./ImplantationPopup";

// Fond OpenStreetMap (raster, sans clé) + police pour les compteurs de clusters
const OSM_STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Pays de la Loire (région 52, groupe 4) : vue initiale centrée sur Nantes
const INITIAL_VIEW = { center: [-1.5536, 47.2184], zoom: 11 };
const SOURCE = "equipements";
const CLICKABLE_LAYERS = ["clusters", "unclustered"];

/** Ajoute la source GeoJSON (avec clustering) et ses couches. */
function addEquipementLayers(map) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 15, // au-delà, tous les points sont affichés individuellement
  });
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: SOURCE,
    minzoom: MIN_ZOOM,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#93c5fd", 50, "#3b82f6", 500, "#1e3a8a"],
      "circle-radius": ["step", ["get", "point_count"], 14, 50, 19, 500, 25],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: SOURCE,
    minzoom: MIN_ZOOM,
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: SOURCE,
    minzoom: MIN_ZOOM,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": domaineColorExpression(),
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 7],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  });
}

/** Crée l'élément DOM d'un repère (la rotation est sur l'enfant, MapLibre gère le parent). */
function markerElement(className) {
  const el = document.createElement("div");
  el.className = "marker";
  const pin = document.createElement("div");
  pin.className = `pin ${className}`;
  el.appendChild(pin);
  return el;
}

export default function MapView({
  filterParams,
  communes,
  domaines,
  implantations,
  addMode,
  draft,
  focus,
  onPickLocation,
  onDraftMove,
  onEditImplantation,
  onDeleteImplantation,
  onMoveImplantation,
  address,
  canAddAtAddress,
  onAddAtAddress,
  onClearAddress,
}) {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [popup, setPopup] = useState(null); // {kind:"equipement"|"implantation"|"adresse", id, lngLat, domaine?}

  // Dernières valeurs des props, lisibles depuis les handlers MapLibre (enregistrés une fois)
  const latest = useRef({});
  latest.current = { addMode, onPickLocation, onMoveImplantation, onDraftMove };

  const status = useTileLoader(map, SOURCE, filterParams);

  // ---------- Initialisation de la carte ----------
  useEffect(() => {
    const m = new maplibregl.Map({ container: containerRef.current, style: OSM_STYLE, ...INITIAL_VIEW });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(new maplibregl.ScaleControl(), "bottom-right");

    m.on("load", () => {
      addEquipementLayers(m);
      setMap(m);
    });

    m.on("click", async (e) => {
      if (latest.current.addMode) {
        latest.current.onPickLocation([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const [f] = m.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS });
      if (!f) return;
      if (f.properties.cluster) {
        // Clic sur un cluster : on zoome jusqu'à ce qu'il éclate
        const zoom = await m.getSource(SOURCE).getClusterExpansionZoom(f.properties.cluster_id);
        m.easeTo({ center: f.geometry.coordinates, zoom });
      } else {
        setPopup({ kind: "equipement", id: f.properties.id, domaine: f.properties.domaine, lngLat: f.geometry.coordinates });
      }
    });

    // Curseur « main » au survol des points
    m.on("mousemove", (e) => {
      if (latest.current.addMode || !m.getLayer("unclustered")) return;
      const hit = m.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS }).length > 0;
      m.getCanvas().style.cursor = hit ? "pointer" : "";
    });

    return () => {
      setMap(null);
      m.remove();
    };
  }, []);

  // Curseur en croix en mode ajout
  useEffect(() => {
    if (map) map.getCanvas().style.cursor = addMode ? "crosshair" : "";
  }, [map, addMode]);

  // ---------- Popup (contenu React rendu dans la popup MapLibre via un portal) ----------
  const popupNode = useMemo(() => (popup ? document.createElement("div") : null), [popup]);

  useEffect(() => {
    if (!map || !popup) return;
    const p = new maplibregl.Popup({ maxWidth: "320px", offset: popup.kind === "implantation" ? 30 : 10 })
      .setLngLat(popup.lngLat)
      .setDOMContent(popupNode)
      .addTo(map);
    // closeOnClick ferme l'ancienne popup APRÈS que le clic en a ouvert une nouvelle :
    // on ne remet à null que si c'est toujours celle-ci qui est affichée
    const onClose = () => setPopup((cur) => (cur === popup ? null : cur));
    p.on("close", onClose);
    return () => {
      p.off("close", onClose);
      p.remove();
    };
  }, [map, popup, popupNode]);

  const popupImplantation =
    popup?.kind === "implantation" ? implantations.find((f) => f.id === popup.id) : null;

  // ---------- Repères des implantations (déplaçables) ----------
  useEffect(() => {
    if (!map) return;
    const markers = implantations
      .filter((f) => f.id !== draft?.id) // celle en cours d'édition est affichée par le repère « brouillon »
      .map((f) => {
        const el = markerElement("implantation");
        el.title = f.properties.titre;
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom", draggable: true })
          .setLngLat(f.geometry.coordinates)
          .addTo(map);
        el.addEventListener("click", (e) => {
          e.stopPropagation(); // ne pas déclencher le clic carte
          setPopup({ kind: "implantation", id: f.id, lngLat: marker.getLngLat().toArray() });
        });
        marker.on("dragstart", () => setPopup(null));
        marker.on("dragend", () => latest.current.onMoveImplantation(f, marker.getLngLat().toArray()));
        return marker;
      });
    return () => markers.forEach((m) => m.remove());
  }, [map, implantations, draft?.id]);

  // Repère « brouillon » (création / édition en cours)
  const draftKey = draft ? `${draft.id ?? "new"}:${draft.coordinates.join(",")}` : null;
  useEffect(() => {
    if (!map || !draft) return;
    const marker = new maplibregl.Marker({ element: markerElement("draft"), anchor: "bottom", draggable: true })
      .setLngLat(draft.coordinates)
      .addTo(map);
    marker.on("dragend", () => latest.current.onDraftMove(marker.getLngLat().toArray()));
    return () => marker.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, draftKey]);

  // ---------- Centrage demandé depuis la liste des implantations ----------
  useEffect(() => {
    if (!map || !focus) return;
    const coords = focus.feature.geometry.coordinates;
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 15) });
    setPopup({ kind: "implantation", id: focus.feature.id, lngLat: coords });
  }, [map, focus]);

  // ---------- Adresse géocodée : on s'y centre et on pose un repère ----------
  useEffect(() => {
    if (!map || !address) return;
    const coords = address.coordinates;
    const marker = new maplibregl.Marker({ element: markerElement("address"), anchor: "bottom" })
      .setLngLat(coords)
      .addTo(map);
    marker.getElement().title = address.label;
    marker.getElement().addEventListener("click", (e) => {
      e.stopPropagation(); // ne pas déclencher le clic carte
      setPopup({ kind: "adresse", lngLat: coords });
    });
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 17) });
    setPopup({ kind: "adresse", lngLat: coords });
    return () => marker.remove();
  }, [map, address]);

  // ---------- Zoom sur les villes sélectionnées ----------
  const communeIds = communes.map((c) => c.id).join(",");
  useEffect(() => {
    if (!map || !communes.length) return;

    function fitTo(bounds) {
      // On ne descend pas sous MIN_ZOOM, sinon plus rien ne s'afficherait
      const cam = map.cameraForBounds(bounds, { padding: 60, maxZoom: 14 });
      if (cam) map.easeTo({ ...cam, zoom: Math.max(cam.zoom, MIN_ZOOM) });
    }

    // Cas normal : le back fournit l'emprise de chaque commune, bbox = [minLon, minLat, maxLon, maxLat]
    if (communes.every((c) => Array.isArray(c.bbox) && c.bbox.length === 4)) {
      const bounds = new maplibregl.LngLatBounds();
      communes.forEach((c) => {
        bounds.extend([c.bbox[0], c.bbox[1]]);
        bounds.extend([c.bbox[2], c.bbox[3]]);
      });
      fitTo(bounds);
      return;
    }

    // Repli : emprise inconnue, on la déduit des équipements de ces villes
    const ctrl = new AbortController();
    apiGet("/equipements/", { commune: communeIds }, { signal: ctrl.signal })
      .then((data) => {
        if (!data.features.length) return;
        const bounds = new maplibregl.LngLatBounds();
        data.features.forEach((f) => bounds.extend(f.geometry.coordinates));
        fitTo(bounds);
      })
      .catch((err) => err.name !== "AbortError" && console.error(err));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, communeIds]);

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map" />

      <div className="map-status">
        {addMode && <span className="badge add">Cliquez sur la carte pour placer l'implantation</span>}
        {status.zoomTooLow && <span className="badge">Zoomez pour voir les équipements</span>}
        {!status.zoomTooLow && status.loading && <span className="badge">Chargement…</span>}
        {!status.zoomTooLow && !status.loading && <span className="badge light">{status.count} équipements chargés</span>}
        {status.error && <span className="badge error">Erreur : {status.error}</span>}
      </div>

      {domaines && domaines.length > 0 && (
        <div className="legend">
          {domaines.map((d) => (
            <div key={d.code}>
              <span className="dot" style={{ background: domaineColor(d.code) }} /> {d.libelle}
            </div>
          ))}
          <div>
            <span className="pin-mini" /> Mes implantations
          </div>
        </div>
      )}

      {popupNode &&
        createPortal(
          popup.kind === "equipement" ? (
            <EquipementPopup id={popup.id} domaineCode={popup.domaine} />
          ) : popup.kind === "adresse" && address ? (
            <div className="popup">
              <div className="popup-tag address">Adresse</div>
              <h4>{address.label}</h4>
              <p className="hint">{address.context}</p>
              {!address.context?.includes("Pays de la Loire") && (
                <p className="hint">Hors région 52 : aucun équipement BPE n’est chargé ici.</p>
              )}
              <div className="actions">
                {canAddAtAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      setPopup(null);
                      onAddAtAddress(address);
                    }}
                  >
                    Implantation ici
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setPopup(null);
                    onClearAddress();
                  }}
                >
                  Effacer
                </button>
              </div>
            </div>
          ) : popupImplantation ? (
            <ImplantationPopup
              feature={popupImplantation}
              onEdit={(f) => {
                setPopup(null);
                onEditImplantation(f);
              }}
              onDelete={async (f) => {
                if (await onDeleteImplantation(f)) setPopup(null);
              }}
            />
          ) : null,
          popupNode
        )}
    </div>
  );
}
