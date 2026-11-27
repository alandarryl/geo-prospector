// Formulaire de création / édition d'une implantation.
// draft = { id?, coordinates:[lon,lat], titre, type_envisage, annotations, commentaire }
import { useState } from "react";

export default function ImplantationForm({ draft, domaines, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    titre: draft.titre || "",
    type_envisage: draft.type_envisage || "",
    annotations: draft.annotations || "",
    commentaire: draft.commentaire || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...values, type_envisage: values.type_envisage || null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const [lon, lat] = draft.coordinates;

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <h3>{draft.id ? "Modifier l'implantation" : "Nouvelle implantation"}</h3>
      <p className="hint">
        Position : {lat.toFixed(5)}, {lon.toFixed(5)} — glissez le repère sur la carte pour l'ajuster.
      </p>

      <label>
        Titre *
        <input required maxLength={200} value={values.titre} onChange={set("titre")} autoFocus />
      </label>

      <label>
        Type de commerce envisagé
        <select value={values.type_envisage} onChange={set("type_envisage")}>
          <option value="">— Non précisé —</option>
          {(domaines || []).flatMap((d) =>
            d.sous_domaines.map((sd) => (
              <optgroup key={sd.code} label={`${d.libelle} › ${sd.libelle}`}>
                {sd.types.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.libelle} ({t.code})
                  </option>
                ))}
              </optgroup>
            ))
          )}
        </select>
      </label>

      <label>
        Annotations
        <textarea rows={3} value={values.annotations} onChange={set("annotations")} />
      </label>

      <label>
        Commentaire
        <textarea rows={3} value={values.commentaire} onChange={set("commentaire")} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}
