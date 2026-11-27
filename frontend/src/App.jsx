import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { fetchEquipements } from "./api";

// Fond de carte OpenStreetMap (raster, sans clé)
const OSM_STYLE = {
  version: 8,
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

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [0.1, 49.2], // à adapter au centre de votre région
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl());

    map.on("load", () => {
      map.addSource("equipements", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "equipements",
        type: "circle",
        source: "equipements",
        paint: { "circle-radius": 5, "circle-color": "#2563eb", "circle-stroke-width": 1, "circle-stroke-color": "#fff" },
      });
      loadVisible();
    });

    // TODO (équipier) : remplacer par un chargement incrémental (cache par tuiles)
    async function loadVisible() {
      const b = map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const data = await fetchEquipements(bbox);
      map.getSource("equipements").setData(data);
    }
    map.on("moveend", loadVisible);

    map.on("click", "equipements", (e) => {
      const f = e.features[0];
      new maplibregl.Popup()
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<strong>${f.properties.type_code}</strong><br/>${f.properties.nom || ""}`)
        .addTo(map);
    });

    return () => map.remove();
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>BPE Explorer</h2>
        <p>Filtres, connexion et implantations à venir.</p>
      </aside>
      <div ref={mapContainer} className="map" />
    </div>
  );
}
