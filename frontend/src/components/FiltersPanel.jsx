// Filtres : arbre Domaine > Sous-domaine > Type (cases à cocher, état indéterminé)
// + sélection de villes. L'état est un Set de codes de TYPES cochés (les feuilles) :
// cocher un parent coche tous ses types.
import { useEffect, useRef, useState } from "react";
import { domaineColor } from "../utils/colors";
import { checkState, typesOfDomaine, typesOfSousDomaine } from "../utils/filters";
import CommuneSelect from "./CommuneSelect";

function TriCheckbox({ state, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} onChange={onChange} disabled={disabled} />;
}

export default function FiltersPanel({ domaines, selectedTypes, onTypesChange, communes, onCommunesChange }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  // Coche / décoche un ensemble de types d'un coup
  function toggle(codes) {
    const next = new Set(selectedTypes);
    const allChecked = checkState(codes, selectedTypes) === "all";
    codes.forEach((c) => (allChecked ? next.delete(c) : next.add(c)));
    onTypesChange(next);
  }

  const matches = (t) => !q || t.libelle.toLowerCase().includes(q) || t.code.toLowerCase().startsWith(q);

  return (
    <section className="panel">
      <h3>Villes</h3>
      <CommuneSelect value={communes} onChange={onCommunesChange} />

      <div className="panel-title">
        <h3>Types d'équipement</h3>
        {selectedTypes.size > 0 && (
          <button type="button" className="link" onClick={() => onTypesChange(new Set())}>
            Tout décocher
          </button>
        )}
      </div>
      <p className="hint">Aucune case cochée = tous les équipements.</p>
      <input type="search" placeholder="Filtrer la liste…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {domaines === null && <p className="hint">Chargement des domaines…</p>}
      <ul className="tree">
        {(domaines || []).map((d) => {
          const dCodes = typesOfDomaine(d);
          const visibleSd = d.sous_domaines
            .map((sd) => ({ ...sd, types: sd.types.filter(matches) }))
            .filter((sd) => sd.types.length > 0 || !q);
          if (q && visibleSd.length === 0) return null;
          return (
            <li key={d.code}>
              <details open={!!q}>
                <summary>
                  <TriCheckbox state={checkState(dCodes, selectedTypes)} onChange={() => toggle(dCodes)} disabled={!dCodes.length} />
                  <span className="dot" style={{ background: domaineColor(d.code) }} />
                  {d.libelle}
                </summary>
                <ul>
                  {visibleSd.map((sd) => {
                    const sdCodes = typesOfSousDomaine(d.sous_domaines.find((x) => x.code === sd.code));
                    return (
                      <li key={sd.code}>
                        <details open={!!q}>
                          <summary>
                            <TriCheckbox state={checkState(sdCodes, selectedTypes)} onChange={() => toggle(sdCodes)} disabled={!sdCodes.length} />
                            {sd.libelle}
                          </summary>
                          <ul>
                            {sd.types.map((t) => (
                              <li key={t.code}>
                                <label>
                                  <input type="checkbox" checked={selectedTypes.has(t.code)} onChange={() => toggle([t.code])} />
                                  {t.libelle} <small>{t.code}</small>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
