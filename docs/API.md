# Documentation de l'API — Geo Prospector

L'API REST et GeoJSON est exposée par le backend Django / GeoDjango / DRF sur `http://localhost:8000` (et accessible via le proxy `/api` depuis `http://localhost:5173`). Aucun endpoint ne utilise de pagination. Les coordonnées géographiques sont en WGS 84 (SRID `4326`) au format `[longitude, latitude]`.

Documentation interactive (Swagger UI) : `http://localhost:8000/api/docs/`[cite: 1]  
Schéma OpenAPI brut : `http://localhost:8000/api/schema/`[cite: 1]

---

## 1. Flux d'authentification JWT

L'authentification repose sur `djangorestframework-simplejwt` (`access` valable 2 heures, `refresh` valable 7 jours)[cite: 1].

1. **Inscription** : `POST /api/auth/register/` avec `{"username": "...", "email": "...", "password": "..."}` → renvoie `201 Created`[cite: 1].
2. **Connexion** : `POST /api/auth/token/` avec `{"username": "...", "password": "..."}` → renvoie `{"access": "...", "refresh": "..."}` (`401 Unauthorized` si identifiants invalides)[cite: 1].
3. **Appels authentifiés** : envoyer l'en-tête `Authorization: Bearer <access>`[cite: 1].
4. **Renouvellement** : `POST /api/auth/token/refresh/` avec `{"refresh": "..."}` → renvoie `{"access": "..."}`[cite: 1].

---

## 2. Endpoints

### `GET /api/health/`
Vérifie la connexion PostgreSQL / PostGIS et le nombre d'équipements importés[cite: 1].

- **Auth** : aucune[cite: 1]
- **Exemple de requête** :
```bash
curl -s http://localhost:8000/api/health/
```
- **Exemple de réponse (`200 OK`)** :
```json
{
  "status": "ok",
  "database": "connected",
  "nb_equipements": 136569
}
```
- **Codes d'erreur** : `503 Service Unavailable` si la base est inaccessible.

---

### `GET /api/equipements/`
Liste légère en GeoJSON des équipements dans la zone visible, limitée à `5000` entités (`BPE_MAX_FEATURES`)[cite: 1]. Les filtres `domaine`, `sous_domaine` et `type` (listes séparées par des virgules) se combinent en **OU**, et `commune` en **ET**[cite: 1].

- **Auth** : aucune[cite: 1]
- **Paramètres** : `in_bbox=minLon,minLat,maxLon,maxLat`, `domaine`, `sous_domaine`, `type`, `commune`[cite: 1]
- **Exemple de requête** :
```bash
curl -s "http://localhost:8000/api/equipements/?in_bbox=-1.75,47.10,-1.31,47.33&domaine=B,D"
```
- **Exemple de réponse (`200 OK`, tronquée)** :
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": 1042,
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-1.5536, 47.2184] },
      "properties": {
        "id": 1042,
        "type_code": "B101",
        "domaine": "B",
        "nom": "Exemple commerce"
      }
    }
  ]
}
```
- **Codes d'erreur** : `400 Bad Request` si `in_bbox` est mal formé[cite: 1].

---

### `GET /api/equipements/tuiles/{z}/{x}/{y}/`
Tuile GeoJSON slippy-map pour le chargement incrémental sur la carte (accepte les mêmes filtres que `/api/equipements/`)[cite: 1].

- **Auth** : aucune[cite: 1]
- **Paramètres** : `z` (zoom `>= 10`), `x`, `y`, plus filtres optionnels (`domaine`, `sous_domaine`, `type`, `commune`)[cite: 1]
- **Cache HTTP** : renvoie `Cache-Control: public, max-age=3600`[cite: 1]
- **Exemple de requête** :
```bash
curl -i -s "http://localhost:8000/api/equipements/tuiles/12/2021/1445/"
```
- **Exemple de réponse (`200 OK`, tronquée)** :
```json
{
  "type": "FeatureCollection",
  "features": []
}
```
- **Codes d'erreur** : `400 Bad Request` si `z < 10` ou coordonnées de tuile invalides[cite: 1].

---

### `GET /api/equipements/{id}/`
Détail complet d'un équipement au clic[cite: 1].

- **Auth** : aucune[cite: 1]
- **Exemple de requête** :
```bash
curl -s http://localhost:8000/api/equipements/1042/
```
- **Exemple de réponse (`200 OK`, tronquée)** :
```json
{
  "id": 1042,
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-1.5536, 47.2184] },
  "properties": {
    "nom": "Exemple commerce",
    "adresse": "12 rue exemple",
    "domaine": "Commerces",
    "commune": { "id": 12, "nom": "Nantes", "departement": "44" }
  }
}
```
- **Codes d'erreur** : `404 Not Found` si l'équipement n'existe pas[cite: 1].

---

### `GET /api/domaines/`
Arbre complet des domaines, sous-domaines et types d'équipements (3 niveaux)[cite: 1].

- **Auth** : aucune[cite: 1]
- **Exemple de requête** :
```bash
curl -s http://localhost:8000/api/domaines/
```
- **Exemple de réponse (`200 OK`, tronquée)** :
```json
[
  {
    "code": "B",
    "libelle": "Commerces",
    "sous_domaines": [
      {
        "code": "B1",
        "libelle": "Grandes surfaces",
        "types": [{ "code": "B101", "libelle": "Hypermarché" }]
      }
    ]
  }
]
```

---

### `GET /api/communes/`
Liste des communes (jusqu'à 50 résultats) pour l'autocomplétion du filtre villes[cite: 1].

- **Auth** : aucune[cite: 1]
- **Paramètres** : `q` (recherche), `ids` (liste d'IDs séparés par des virgules)[cite: 1]
- **Exemple de requête** :
```bash
curl -s "http://localhost:8000/api/communes/?q=nan"
```
- **Exemple de réponse (`200 OK`, tronquée)** :
```json
[
  {
    "id": 12,
    "nom": "Nantes",
    "departement": "44",
    "bbox": [-1.65, 47.18, -1.48, 47.29]
  }
]
```

---

### `POST /api/auth/register/`, `POST /api/auth/token/`, `POST /api/auth/token/refresh/`, `GET /api/auth/me/`
Gestion des comptes et jetons JWT[cite: 1].

- **Auth** : publique pour `register`, `token`, `token/refresh` ; `Bearer <access>` obligatoire pour `me`[cite: 1].
- **Exemple de requête (`me`)** :
```bash
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8000/api/auth/me/
```
- **Exemple de réponse (`200 OK` sur `me`)** :
```json
{
  "id": 2,
  "username": "user1",
  "email": "user1@example.com",
  "nb_implantations": 1
}
```
- **Codes d'erreur** : `400 Bad Request` (données invalides), `401 Unauthorized` (identifiants ou token invalide/absent)[cite: 1].

---

### `GET /api/implantations/` & `POST /api/implantations/`
Liste et création des implantations potentielles privées de l'utilisateur connecté (GeoJSON `FeatureCollection` / `Feature`)[cite: 1].

- **Auth** : `Bearer <access>` obligatoire[cite: 1]
- **Paramètres (`GET`)** : `in_bbox` optionnel (`minLon,minLat,maxLon,maxLat`)[cite: 1]
- **Corps (`POST`)** : GeoJSON `Feature` avec `geometry` (`Point` `[lon, lat]`) et `properties` (`titre` obligatoire, `type_envisage`, `annotations`, `commentaire`)[cite: 1]
- **Exemple de requête (`POST`)** :
```bash
curl -s -X POST http://localhost:8000/api/implantations/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"Feature","geometry":{"type":"Point","coordinates":[-1.5536,47.2184]},"properties":{"titre":"Point test","annotations":"Angle","commentaire":"Passage"}}'
```
- **Exemple de réponse (`201 Created`, tronquée)** :
```json
{
  "id": 1,
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-1.5536, 47.2184] },
  "properties": {
    "titre": "Point test",
    "type_envisage": null,
    "annotations": "Angle",
    "commentaire": "Passage"
  }
}
```
- **Codes d'erreur** : `400 Bad Request` (champ manquant ou géométrie invalide), `401 Unauthorized` (non connecté)[cite: 1].

---

### `GET /api/implantations/{id}/`, `PUT` / `PATCH`, `DELETE`
Consultation, modification ou suppression d'une implantation appartenant à l'utilisateur connecté[cite: 1].

- **Auth** : `Bearer <access>` obligatoire[cite: 1]
- **Note `PATCH`** : toujours inclure `"properties": {}` (même vide) avec `"geometry"` si tu déplaces le point[cite: 1].
- **Exemple de requête (`DELETE`)** :
```bash
curl -s -X DELETE -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8000/api/implantations/1/
```
- **Codes d'erreur** : `400 Bad Request`, `401 Unauthorized`, `404 Not Found` (ID inexistant ou implantation appartenant à un autre utilisateur)[cite: 1].

---

## 3. Chargement incrémental par tuiles

Le frontend découpe la carte selon le schéma *slippy-map* (Web Mercator) à partir du zoom `z >= 10` (`BPE_MIN_TILE_ZOOM = 10`)[cite: 1] :

- À un niveau de zoom `z`, la grille compte $2^z \times 2^z$ tuiles indexées par `x` (ouest → est) et `y` (nord → sud)[cite: 1].
- Chaque tuile `(z, x, y)` correspond à une emprise géographique `[minLon, minLat, maxLon, maxLat]` calculée par conversion des indices de tuile en degrés WGS 84 (`lon` depuis `x / 2^z * 360 - 180`, `lat` via `atan(sinh(pi * (1 - 2 * y / 2^z)))`)[cite: 1].
- Lors d'un déplacement ou d'un zoom, le frontend ne demande que les nouvelles tuiles visibles, et le backend ajoute l'en-tête `Cache-Control: public, max-age=3600` pour limiter les requêtes répétées[cite: 1].