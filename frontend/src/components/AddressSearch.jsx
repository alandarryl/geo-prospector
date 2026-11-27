// Recherche d'une adresse postale (géocodage) : on tape, on choisit, la carte s'y centre.
import { useEffect, useState } from "react";
import { geocodeAddress } from "../api";

export default function AddressSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  // Debounce 300 ms + annulation de la requête précédente (comme pour les villes)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      geocodeAddress(q, ctrl.signal)
        .then((features) => {
          setResults(features);
          setError(features.length ? null : "Aucune adresse trouvée.");
        })
        .catch((err) => err.name !== "AbortError" && setError(err.message));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  function choose(feature) {
    setQuery(feature.properties.label);
    setResults([]);
    setOpen(false);
    onSelect({
      label: feature.properties.label,
      coordinates: feature.geometry.coordinates, // [lon, lat]
      context: feature.properties.context, // ex « 44, Loire-Atlantique, Pays de la Loire »
      t: Date.now(), // pour recentrer même si on choisit deux fois la même adresse
    });
  }

  // Entrée = premier résultat
  function handleKeyDown(e) {
    if (e.key === "Enter" && results.length) {
      e.preventDefault();
      choose(results[0]);
    }
  }

  return (
    <section className="panel">
      <h3>Adresse</h3>
      <div className="commune-select">
        <input
          type="search"
          placeholder="Ex : 1 place Royale, Nantes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <ul className="suggestions">
            {results.map((f) => (
              <li key={f.properties.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(f)}>
                  {f.properties.label} <small>({f.properties.context})</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="hint">{error}</p>}
    </section>
  );
}
