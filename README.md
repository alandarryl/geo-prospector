# Geo Prospector — Prospection commerciale géographique

Application web pour explorer les équipements de la **Base permanente des équipements (BPE 2025, INSEE)**
de la région **Pays de la Loire (52)** sur une carte, les filtrer par domaine et par ville, et enregistrer
ses **implantations potentielles** (privées, réservées à l'utilisateur connecté).

| Couche | Techno |
|---|---|
| Front | React 19 + Vite + MapLibre GL JS |
| Back | Python 3.13, Django, GeoDjango, Django REST Framework, simplejwt, drf-spectacular |
| BDD | PostgreSQL 17 + PostGIS 3.5 |
| Infra | Docker / docker compose (code monté en volume, hors des images) |

## Installation (local, reproductible)

Prérequis : **Docker Desktop** (ou Docker Engine + compose v2) et **Git**.
Pas besoin d'installer Python ni Node sur la machine.

```bash
git clone https://github.com/alandarryl/geo-prospector.git
cd geo-prospector
cp .env.example .env                    # BPE_REGION=52 est déjà renseigné
docker compose up -d --build            # db (PostGIS) + backend (Django) + frontend (Vite)
docker compose exec backend python manage.py migrate
```

> Sous Windows (PowerShell), remplacer `cp .env.example .env` par `Copy-Item .env.example .env` ;
> les commandes `docker compose` sont identiques.
>
> Le premier `up --build` télécharge les images et construit l'image Python (quelques minutes).
> Sur Mac Apple Silicon (M1/M2/M3), PostGIS tourne en émulation `linux/amd64` : c'est voulu
> (l'image officielle n'existe pas en arm64), le démarrage est juste un peu plus lent.

Compte administrateur (facultatif, pour http://localhost:8000/admin/) :

```bash
docker compose exec backend python manage.py createsuperuser
```

## Import des données BPE

1. Récupérer le fichier parquet BPE 2025 (lien « Le fichier parquet nettoyé » du sujet,
   fichier `bpe25_clean.parquet`) et le placer dans **`data/bpe.parquet`** (dossier non versionné).
2. Importer la région 52 :

```bash
docker compose exec backend python manage.py import_bpe --reset
```

Résultat attendu : `142580 équipements pour la région 52`, dont `6011 lignes ignorées`
(sans coordonnées, type ou ville), soit **136 569 équipements importés**, 7 domaines,
27 sous-domaines, 232 types et 1 228 communes (avec leur emprise).

Options : `--inspect` affiche les colonnes du fichier, `--region 28` importe une autre région (code INSEE de région),
`--emprises` recalcule seulement l'emprise des communes.

Vérifier : http://localhost:8000/api/health/ doit renvoyer `"nb_equipements": 136569`.

## Accès

| URL | Quoi |
|---|---|
| http://localhost:5173 | Application React |
| http://localhost:8000/api/docs/ | Documentation API interactive (Swagger) |
| http://localhost:8000/api/health/ | État de la base et nombre d'équipements |
| http://localhost:8000/admin/ | Admin Django |

## Utilisation

- **Carte** : zoomer / déplacer ; les équipements apparaissent à partir du zoom 10, regroupés en
  clusters (clic sur un cluster = zoom). Seules les zones pas encore chargées sont demandées au serveur.
- **Filtres** : arbre Domaine → Sous-domaine → Type (cocher un parent coche ses enfants) et une ou
  plusieurs villes (la carte zoome dessus). Aucune case cochée = tous les équipements.
- **Détail** : clic sur un point.
- **Implantations** : s'inscrire / se connecter, « + Ajouter », cliquer sur la carte, remplir le
  formulaire (titre, type envisagé, annotations, commentaire). Le repère se déplace à la souris ;
  modifier / supprimer depuis sa popup. Elles sont retrouvées à la connexion suivante.

## API (résumé — détail dans /api/docs/)

Réponses géographiques en GeoJSON, coordonnées WGS84 `[lon, lat]`.

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/equipements/?in_bbox=minLon,minLat,maxLon,maxLat&domaine=B&sous_domaine=B2&type=B207&commune=99` | non | Équipements visibles (5000 max) ; domaine / sous_domaine / type en OU, commune en ET |
| GET | `/api/equipements/{id}/` | non | Détail d'un équipement |
| GET | `/api/domaines/` | non | Arbre domaine > sous-domaine > type |
| GET | `/api/communes/?q=nan` | non | Recherche de communes (`id`, `nom`, `departement`, `bbox`) |
| GET | `/api/health/` | non | État de la base |
| POST | `/api/auth/register/` | non | Inscription (`username`, `password` 8 caractères min, `email` facultatif) |
| POST | `/api/auth/token/` | non | Connexion → `access` + `refresh` (JWT) |
| POST | `/api/auth/token/refresh/` | non | Nouveau jeton `access` |
| GET | `/api/auth/me/` | oui | Utilisateur connecté |
| GET/POST | `/api/implantations/` | oui | Lister / créer ses implantations |
| GET/PUT/PATCH/DELETE | `/api/implantations/{id}/` | oui | Gérer une implantation (404 si elle n'est pas à vous) |

## Documentation détaillée

- [Documentation de l'API](docs/API.md) : endpoints, paramètres, flux JWT
- [Modèle de données](docs/MODELE_DONNEES.md) : schéma et normalisation de la BPE
- [Post mortem](docs/POST_MORTEM.md)
- [Workflow Git](docs/GIT_WORKFLOW.md)

## Structure

```
geo-prospector/
├── docker-compose.yaml        # db (postgis) + backend (django) + frontend (vite)
├── .env.example               # variables à copier en .env
├── data/                      # bpe.parquet (non versionné)
├── backend/
│   ├── Dockerfile             # image python + GDAL + dépendances (sans le code)
│   ├── config/                # settings, urls, /api/health/
│   ├── bpe/                   # référentiel BPE : modèles, API, import parquet
│   │   └── management/commands/import_bpe.py
│   └── prospection/           # implantations, inscription, /api/auth/me/, tests
├── frontend/src/
│   ├── App.jsx, api.js, index.css
│   ├── components/            # MapView, FiltersPanel, CommuneSelect, popups, AuthPanel, ImplantationForm
│   ├── hooks/                 # useTileLoader (chargement incrémental), useAuth, useImplantations
│   └── utils/                 # tiles, filters, colors
└── docs/                      # workflow git, instructions, post mortem
```

## Commandes utiles

```bash
docker compose logs -f backend                         # logs Django
docker compose exec backend python manage.py test      # tests du back
docker compose exec db psql -U bpe -d bpe              # console SQL
docker compose down                                    # arrêt (garde les données)
docker compose down -v                                 # arrêt + suppression de la base
```

Ajouter un paquet front : `docker compose exec frontend npm install <paquet>` puis
`docker compose restart frontend`. Après un changement de `requirements.txt` :
`docker compose up -d --build backend`.
