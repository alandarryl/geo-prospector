// Point d'entrée unique pour parler à l'API Django
const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null))
  );
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export async function apiSend(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.status === 204 ? null : res.json();
}

// Équipements visibles dans la bbox [minLon, minLat, maxLon, maxLat]
export function fetchEquipements(bbox, filters = {}) {
  return apiGet("/equipements/", { in_bbox: bbox.join(","), ...filters });
}
