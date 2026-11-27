// CRUD des implantations potentielles de l'utilisateur connecté (privées, côté back).
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api";

/** Construit le corps GeoJSON attendu par l'API. */
function toFeature(coordinates, properties) {
  return {
    type: "Feature",
    ...(coordinates ? { geometry: { type: "Point", coordinates } } : {}),
    properties,
  };
}

export function useImplantations(user) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  // On ne recharge que si l'utilisateur change vraiment (pas quand /auth/me/ complète ses infos)
  const username = user?.username ?? null;

  useEffect(() => {
    if (!username) {
      setItems([]);
      return;
    }
    let cancelled = false;
    apiGet("/implantations/")
      .then((data) => !cancelled && setItems(data.features || []))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const create = useCallback(async (coordinates, properties) => {
    const created = await apiSend("POST", "/implantations/", toFeature(coordinates, properties));
    setItems((list) => [created, ...list]);
    return created;
  }, []);

  /** coordinates ou properties peuvent être null (mise à jour partielle). */
  const update = useCallback(async (id, coordinates, properties = {}) => {
    const updated = await apiSend("PATCH", `/implantations/${id}/`, toFeature(coordinates, properties));
    setItems((list) => list.map((f) => (f.id === id ? updated : f)));
    return updated;
  }, []);

  const remove = useCallback(async (id) => {
    await apiSend("DELETE", `/implantations/${id}/`);
    setItems((list) => list.filter((f) => f.id !== id));
  }, []);

  return { items, error, setError, create, update, remove };
}
