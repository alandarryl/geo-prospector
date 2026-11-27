// Point d'entrée unique pour parler à l'API Django (URLs relatives, le proxy Vite redirige).
const BASE = "/api";

// ---------- Jetons JWT (localStorage) ----------
export function getTokens() {
  return { access: localStorage.getItem("access"), refresh: localStorage.getItem("refresh") };
}

export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("username");
}

function authHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------- Erreurs ----------
/** Erreur API avec le statut HTTP et le corps JSON éventuel (erreurs de validation DRF). */
export class ApiError extends Error {
  constructor(status, data, path) {
    super(formatError(status, data, path));
    this.status = status;
    this.data = data;
  }
}

function formatError(status, data, path) {
  if (data && typeof data === "object") {
    if (data.detail) return String(data.detail);
    // {"username": ["Ce nom existe déjà."], "password": [...]}
    const parts = Object.entries(data).map(
      ([k, v]) => `${k} : ${Array.isArray(v) ? v.join(" ") : typeof v === "object" ? JSON.stringify(v) : v}`
    );
    if (parts.length) return parts.join(" · ");
  }
  return `Erreur ${status} sur ${path}`;
}

// ---------- Refresh automatique ----------
let refreshPromise = null; // partagé : plusieurs 401 simultanés => un seul refresh

async function refreshAccess() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        setTokens(await res.json());
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Requête générique.
 * - auth=false : n'envoie pas le jeton (login / inscription).
 * - sur 401 : tente un refresh puis rejoue la requête une fois ; si le refresh échoue,
 *   on se déconnecte (événement "auth:logout") et on rejoue sans jeton
 *   (utile pour les endpoints publics quand un vieux jeton traîne).
 */
async function request(method, path, { params, body, signal, auth = true } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const clean = Object.entries(params).filter(([, v]) => v !== "" && v != null);
    if (clean.length) url += `?${new URLSearchParams(clean)}`;
  }

  const doFetch = () =>
    fetch(url, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth ? authHeaders() : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401 && auth && getTokens().access) {
    const ok = await refreshAccess();
    if (!ok) {
      clearTokens();
      window.dispatchEvent(new Event("auth:logout"));
    }
    res = await doFetch();
  }

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* pas de JSON (ex: page d'erreur 500 HTML) */
    }
    throw new ApiError(res.status, data, path);
  }
  return res.status === 204 ? null : res.json();
}

export function apiGet(path, params = {}, options = {}) {
  return request("GET", path, { params, ...options });
}

export function apiSend(method, path, body, options = {}) {
  return request(method, path, { body, ...options });
}

// ---------- Raccourcis métier ----------

/** Équipements visibles dans la bbox [minLon, minLat, maxLon, maxLat] (filtres en CSV). */
export function fetchEquipements(bbox, filters = {}, signal) {
  return apiGet("/equipements/", { in_bbox: bbox.map((v) => v.toFixed(6)).join(","), ...filters }, { signal });
}

export function fetchEquipement(id, signal) {
  return apiGet(`/equipements/${id}/`, {}, { signal });
}

export function fetchDomaines() {
  return apiGet("/domaines/");
}

export function searchCommunes(q, signal) {
  return apiGet("/communes/", { q }, { signal });
}

// ---------- Géocodage d'adresses (service externe) ----------
// Géoplateforme de l'IGN (ex « API Adresse » data.gouv.fr) : gratuit, sans clé,
// adresses françaises, réponse GeoJSON en [lon, lat]. Appelé directement par le
// navigateur (CORS ouvert), il ne passe donc pas par Django.
const GEOCODER_URL = "https://data.geopf.fr/geocodage/search";
const REGION_CENTER = { lon: -0.8, lat: 47.4 }; // Pays de la Loire : résultats proches en premier

export async function geocodeAddress(q, signal) {
  const params = new URLSearchParams({
    q,
    limit: "6",
    autocomplete: "1",
    lon: String(REGION_CENTER.lon),
    lat: String(REGION_CENTER.lat),
  });
  const res = await fetch(`${GEOCODER_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Géocodage indisponible (${res.status})`);
  const data = await res.json();
  return data.features || [];
}
