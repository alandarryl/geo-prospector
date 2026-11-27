// Popup d'une implantation : infos + boutons Modifier / Supprimer.
export default function ImplantationPopup({ feature, onEdit, onDelete }) {
  const p = feature.properties;
  return (
    <div className="popup">
      <div className="popup-tag implantation">Implantation potentielle</div>
      <h4>{p.titre}</h4>
      <dl>
        {p.type_envisage && (
          <>
            <dt>Type envisagé</dt>
            <dd>
              {p.type_envisage_libelle} <small>({p.type_envisage})</small>
            </dd>
          </>
        )}
        {p.annotations && (
          <>
            <dt>Annotations</dt>
            <dd className="pre">{p.annotations}</dd>
          </>
        )}
        {p.commentaire && (
          <>
            <dt>Commentaire</dt>
            <dd className="pre">{p.commentaire}</dd>
          </>
        )}
        <dt>Modifiée le</dt>
        <dd>{new Date(p.updated_at).toLocaleString("fr-FR")}</dd>
      </dl>
      <p className="hint">Glissez le repère pour le déplacer.</p>
      <div className="actions">
        <button type="button" onClick={() => onEdit(feature)}>Modifier</button>
        <button type="button" className="danger" onClick={() => onDelete(feature)}>Supprimer</button>
      </div>
    </div>
  );
}
