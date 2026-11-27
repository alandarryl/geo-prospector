// Autocomplétion multi-villes : on tape, on choisit, la ville devient une « pastille ».
import { useEffect, useState } from "react";
import { searchCommunes } from "../api";

export default function CommuneSelect({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  // Recherche avec debounce de 300 ms + annulation de la requête précédente
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchCommunes(q, ctrl.signal)
        .then((list) => setResults(list))
        .catch((err) => err.name !== "AbortError" && console.error(err));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const selectedIds = new Set(value.map((c) => c.id));

  function add(commune) {
    if (!selectedIds.has(commune.id)) onChange([...value, commune]);
    setQuery("");
    setResults([]);
  }

  function remove(id) {
    onChange(value.filter((c) => c.id !== id));
  }

  const suggestions = results.filter((c) => !selectedIds.has(c.id));

  return (
    <div className="commune-select">
      {value.length > 0 && (
        <div className="chips">
          {value.map((c) => (
            <span key={c.id} className="chip">
              {c.nom}
              <button type="button" onClick={() => remove(c.id)} aria-label={`Retirer ${c.nom}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="search"
        placeholder="Rechercher une ville…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(c)}>
                {c.nom} <small>({c.departement}{c.nb_equipements != null ? ` · ${c.nb_equipements} équip.` : ""})</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
