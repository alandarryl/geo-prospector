// Layout + état global : filtres, utilisateur, implantations.
import { useEffect, useMemo, useState } from "react";
import { fetchDomaines } from "./api";
import AddressSearch from "./components/AddressSearch";
import AuthPanel from "./components/AuthPanel";
import FiltersPanel from "./components/FiltersPanel";
import ImplantationForm from "./components/ImplantationForm";
import MapView from "./components/MapView";
import { useAuth } from "./hooks/useAuth";
import { useImplantations } from "./hooks/useImplantations";
import { buildFilterParams } from "./utils/filters";

export default function App() {
  const { user, login, register, logout } = useAuth();
  const implantations = useImplantations(user);

  // Référentiel des domaines (arbre 3 niveaux), chargé une fois
  const [domaines, setDomaines] = useState(null);
  const [domainesError, setDomainesError] = useState(null);
  useEffect(() => {
    fetchDomaines().then(setDomaines).catch((err) => setDomainesError(err.message));
  }, []);

  // Filtres
  const [selectedTypes, setSelectedTypes] = useState(() => new Set());
  const [communes, setCommunes] = useState([]);
  const filterParams = useMemo(
    () => buildFilterParams(domaines || [], selectedTypes, communes),
    [domaines, selectedTypes, communes]
  );

  // Implantations : mode ajout, brouillon du formulaire, centrage
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState(null); // {id?, coordinates, titre, ...}
  const [focus, setFocus] = useState(null);

  // Adresse géocodée affichée sur la carte : {label, coordinates:[lon,lat], context, t}
  const [address, setAddress] = useState(null);

  // Depuis le repère d'adresse : ouvre le formulaire d'implantation à cet endroit
  function addImplantationAt(addr) {
    setAddMode(false);
    setDraft({ coordinates: addr.coordinates, annotations: `Adresse : ${addr.label}` });
  }

  // Déconnexion : on ferme tout ce qui concerne les implantations
  useEffect(() => {
    if (!user) {
      setAddMode(false);
      setDraft(null);
    }
  }, [user]);

  function startEdit(feature) {
    setAddMode(false);
    setDraft({ id: feature.id, coordinates: feature.geometry.coordinates, ...feature.properties });
  }

  async function handleSubmit(values) {
    if (draft.id) await implantations.update(draft.id, draft.coordinates, values);
    else await implantations.create(draft.coordinates, values);
    setDraft(null);
  }

  async function handleDelete(feature) {
    if (!window.confirm(`Supprimer « ${feature.properties.titre} » ?`)) return false;
    try {
      await implantations.remove(feature.id);
      if (draft?.id === feature.id) setDraft(null);
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  async function handleMove(feature, coordinates) {
    try {
      await implantations.update(feature.id, coordinates);
    } catch (err) {
      alert(`Déplacement impossible : ${err.message}`);
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>BPE Explorer</h2>

        <AuthPanel user={user} onLogin={login} onRegister={register} onLogout={logout} />

        {user && (
          <section className="panel">
            <div className="panel-title">
              <h3>Mes implantations</h3>
              {!draft && (
                <button
                  type="button"
                  className={addMode ? "secondary" : ""}
                  onClick={() => setAddMode((m) => !m)}
                >
                  {addMode ? "Annuler" : "+ Ajouter"}
                </button>
              )}
            </div>
            {implantations.error && <p className="error">{implantations.error}</p>}

            {draft ? (
              <ImplantationForm
                key={draft.id ?? "new"}
                draft={draft}
                domaines={domaines}
                onSubmit={handleSubmit}
                onCancel={() => setDraft(null)}
              />
            ) : implantations.items.length === 0 ? (
              <p className="hint">Aucune implantation. Cliquez sur « Ajouter » puis sur la carte.</p>
            ) : (
              <ul className="implantation-list">
                {implantations.items.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="link" onClick={() => setFocus({ feature: f, t: Date.now() })}>
                      {f.properties.titre}
                    </button>
                    {f.properties.type_envisage_libelle && <small>{f.properties.type_envisage_libelle}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <AddressSearch onSelect={setAddress} />

        {domainesError && <p className="error">Domaines indisponibles : {domainesError}</p>}
        <FiltersPanel
          domaines={domaines}
          selectedTypes={selectedTypes}
          onTypesChange={setSelectedTypes}
          communes={communes}
          onCommunesChange={setCommunes}
        />
      </aside>

      <MapView
        filterParams={filterParams}
        communes={communes}
        domaines={domaines}
        implantations={implantations.items}
        addMode={addMode}
        draft={draft}
        focus={focus}
        address={address}
        canAddAtAddress={!!user && !draft}
        onAddAtAddress={addImplantationAt}
        onClearAddress={() => setAddress(null)}
        onPickLocation={(coordinates) => {
          setAddMode(false);
          setDraft({ coordinates });
        }}
        onDraftMove={(coordinates) => setDraft((d) => d && { ...d, coordinates })}
        onEditImplantation={startEdit}
        onDeleteImplantation={handleDelete}
        onMoveImplantation={handleMove}
      />
    </div>
  );
}
