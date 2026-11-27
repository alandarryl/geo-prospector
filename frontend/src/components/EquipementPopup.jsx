// Détail d'un équipement (chargé à la demande via /api/equipements/{id}/).
import { useEffect, useState } from "react";
import { fetchEquipement } from "../api";
import { domaineColor } from "../utils/colors";

export default function EquipementPopup({ id, domaineCode }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetchEquipement(id, ctrl.signal)
      .then((f) => setData(f.properties))
      .catch((err) => err.name !== "AbortError" && setError(err.message));
    return () => ctrl.abort();
  }, [id]);

  if (error) return <div className="popup"><p className="error">{error}</p></div>;
  if (!data) return <div className="popup"><p className="hint">Chargement…</p></div>;

  return (
    <div className="popup">
      <div className="popup-tag" style={{ background: domaineColor(domaineCode) }}>
        {data.domaine}
      </div>
      <h4>{data.nom || data.type_equipement?.libelle}</h4>
      <dl>
        <dt>Type</dt>
        <dd>
          {data.type_equipement?.libelle} <small>({data.type_equipement?.code})</small>
        </dd>
        <dt>Sous-domaine</dt>
        <dd>{data.sous_domaine}</dd>
        {data.adresse && (
          <>
            <dt>Adresse</dt>
            <dd>{data.adresse}</dd>
          </>
        )}
        {data.commune && (
          <>
            <dt>Commune</dt>
            <dd>
              {data.code_postal ? `${data.code_postal} ` : ""}
              {data.commune.nom} <small>({data.commune.departement})</small>
            </dd>
          </>
        )}
        {data.siret && (
          <>
            <dt>SIRET</dt>
            <dd>{data.siret}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
