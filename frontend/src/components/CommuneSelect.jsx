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

  const selectedCodes = new Set(value.map((c) => c.code_insee));

  function add(commune) {
    if (!selectedCodes.has(commune.code_insee)) onChange([...value, commune]);
    setQuery("");
    setResults([]);
  }

  function remove(code) {
    onChange(value.filter((c) => c.code_insee !== code));
  }

  const suggestions = results.filter((c) => !selectedCodes.has(c.code_insee));

  return (
    <div className="commune-select">
      {value.length > 0 && (
        <div className="chips">
          {value.map((c) => (
            <span key={c.code_insee} className="chip">
              {c.nom}
              <button type="button" onClick={() => remove(c.code_insee)} aria-label={`Retirer ${c.nom}`}>
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
            <li key={c.code_insee}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(c)}>
                {c.nom} <small>({c.departement} · {c.code_insee})</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
