# BPE Explorer — Prospection commerciale géographique

Application web pour explorer les équipements de la **Base permanente des équipements (BPE, INSEE)**
sur une carte, filtrer par domaine / ville, et enregistrer ses **implantations potentielles** (privées).

| Couche | Techno |
|---|---|
| Front | React 19 + Vite + MapLibre GL JS |
| Back | Python 3.13, Django, GeoDjango, Django REST Framework |
| BDD | PostgreSQL 17 + PostGIS 3.5 |
| Infra | Docker / docker compose (code monté en volume, hors des containers) |

## Structure

```
bpe-explorer/
├── docker-compose.yaml        # db (postgis) + backend (django) + frontend (vite)
├── .env.example               # variables à copier en .env
├── data/                      # mettre ici bpe.parquet (non versionné)
├── backend/
│   ├── Dockerfile             # image python + GDAL + dépendances (sans le code)
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/                # settings, urls (API + /api/docs)
│   ├── bpe/                   # référentiel BPE : modèles, API, import parquet
│   │   └── management/commands/import_bpe.py
│   └── prospection/           # implantations potentielles + inscription
├── frontend/
│   ├── package.json, vite.config.js, index.html
│   └── src/ (main.jsx, App.jsx, api.js, index.css)
└── docs/                      # workflow git, instructions, prompts
```

## Installation (local, reproductible)

Prérequis : Docker Desktop (ou Docker Engine + compose v2) et Git. **Pas besoin d'installer Python ni Node** sur la machine.

```bash
git clone <url-du-repo> && cd bpe-explorer
cp .env.example .env                   # puis mettre BPE_REGION = code de votre région
docker compose up -d --build           # construit l'image python, lance db/back/front
docker compose exec backend python manage.py makemigrations bpe prospection
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

## Import des données BPE

1. Télécharger le fichier parquet BPE 2025 (lien du sujet) et le placer dans `data/bpe.parquet`.
2. Vérifier les colonnes : `docker compose exec backend python manage.py import_bpe --inspect`
   (si un nom diffère, ajuster `COLUMN_CANDIDATES` dans `backend/bpe/management/commands/import_bpe.py`).
3. Importer : `docker compose exec backend python manage.py import_bpe --reset`

## Accès

| URL | Quoi |
|---|---|
| http://localhost:5173 | Application React |
| http://localhost:8000/api/docs/ | Documentation API (Swagger) |
| http://localhost:8000/admin/ | Admin Django |

## API (résumé — détail dans /api/docs/)

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/equipements/?in_bbox=minLon,minLat,maxLon,maxLat&domaine=B&sous_domaine=B1&type=B101&commune=76540` | non | Équipements visibles (GeoJSON) |
| GET | `/api/equipements/{id}/` | non | Détail d'un équipement |
| GET | `/api/domaines/` | non | Arbre domaine > sous-domaine > type |
| GET | `/api/communes/?q=rou` | non | Recherche de communes |
| POST | `/api/auth/register/` | non | Inscription |
| POST | `/api/auth/token/` | non | Connexion → `access` + `refresh` (JWT) |
| GET/POST | `/api/implantations/` | oui | Lister / créer ses implantations |
| GET/PUT/PATCH/DELETE | `/api/implantations/{id}/` | oui | Gérer une implantation |

## Commandes utiles

```bash
docker compose logs -f backend                 # logs django
docker compose exec backend python manage.py shell
docker compose exec db psql -U bpe -d bpe      # console SQL
docker compose down                            # stop (garde les données)
docker compose down -v                         # stop + supprime la base
```
