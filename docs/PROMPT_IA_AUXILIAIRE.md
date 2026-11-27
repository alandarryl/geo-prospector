# Prompt pour une autre IA (tâches auxiliaires — partie Back & Données)

> À coller au début d'une conversation avec n'importe quel assistant, puis ajouter la tâche précise
> à la fin. Joindre les fichiers concernés quand la tâche porte sur du code existant.

---

Contexte : je travaille sur un projet de cours « Docker / Full Stack » en binôme. Je suis responsable du **backend, des données, de Docker et de la documentation technique** ; mon coéquipier fait le front React. Réponds en français, avec du code complet et directement utilisable. Si une information te manque, pose la question plutôt que d'inventer.

## Le projet
Plateforme d'exploration et de prospection commerciale géographique à partir de la **Base permanente des équipements (BPE 2025, INSEE)**, filtrée sur notre région (code région INSEE dans la variable `BPE_REGION`). Carte des équipements, filtres par domaine (3 niveaux) et par villes, chargement limité à la zone visible, et implantations potentielles privées par utilisateur connecté.

## Contraintes imposées (notées)
- Backend **obligatoirement Python / Django** (tout autre back = malus) : Django ≥ 5.2, **GeoDjango**, **Django REST Framework** (+ djangorestframework-gis, simplejwt, drf-spectacular, django-filter, django-cors-headers).
- Base **PostgreSQL 17 + PostGIS 3.5** via l'image officielle `postgis/postgis`.
- Docker : image Python construite avec ses dépendances (python:3.13-slim + GDAL/GEOS/PROJ), **le code n'est pas copié dans l'image, il est monté en volume**. `docker-compose.yaml` avec services `db`, `backend`, `frontend` (node:24-alpine, Vite).
- Dernières versions stables. Application reproductible en local à partir du README.
- Livrables : app opérationnelle, Dockerfile + docker-compose.yaml, sources sur GitHub (seule `main` compte), modèle de données PostgreSQL/PostGIS, documentation API, doc d'installation / import / utilisation, post mortem, présentation orale de 10 min.

## Structure backend
```
backend/
├── Dockerfile, requirements.txt, manage.py
├── config/settings.py        # config via variables d'env (.env), JWT, CORS, spectacular
├── config/urls.py            # /api/auth/{register,token,token/refresh}/, /api/, /api/docs/, /admin/
├── bpe/
│   ├── models.py             # Domaine(code PK) → SousDomaine(code PK, FK domaine) → TypeEquipement(code PK, FK sous_domaine)
│   │                         # Commune(code_insee PK, nom, departement, region)
│   │                         # Equipement(FK type_equipement, FK commune, nom, adresse, qualite_geoloc, annee, geom Point 4326 + index GiST)
│   ├── serializers.py        # GeoJSON léger (carte) + détail + arbre domaines
│   ├── views.py              # EquipementViewSet (InBBoxFilter + filtres CSV domaine/sous_domaine/type en OU, commune), DomaineViewSet, CommuneViewSet
│   └── management/commands/import_bpe.py   # lit le parquet (pandas/pyarrow), filtre la région, normalise
│                                           # en tables de référence + bulk_create ; options --inspect --reset --region
└── prospection/
    ├── models.py             # Implantation(user FK, titre, type_envisage FK TypeEquipement, annotations, commentaire, geom Point 4326, dates)
    ├── views.py              # ImplantationViewSet (IsAuthenticated + IsOwner, queryset filtré sur l'utilisateur), RegisterView
    └── serializers.py
```

## Contrat d'API (ne pas le casser sans prévenir le front)
- `GET /api/equipements/?in_bbox=minLon,minLat,maxLon,maxLat&domaine=&sous_domaine=&type=&commune=` → GeoJSON, properties `id, type_code, domaine, nom`, max 5000
- `GET /api/equipements/{id}/` → détail complet
- `GET /api/domaines/` → arbre 3 niveaux ; `GET /api/communes/?q=`
- `POST /api/auth/register/`, `POST /api/auth/token/`, `POST /api/auth/token/refresh/` (JWT)
- `CRUD /api/implantations/` (Bearer, privé par utilisateur, GeoJSON)

## Organisation
Git : `main` (rendu) ← `test` (intégration) ← `feature/back-*` (mes branches). Je ne modifie pas `frontend/`. Je suis le seul à créer les migrations Django.

## Exemples de tâches que je peux te confier
- Optimiser l'import (vitesse, colonnes du parquet, libellés de la nomenclature BPE à partir d'un fichier séparé).
- Optimiser la requête bbox (index, `only()`, cache, simplification à faible zoom, endpoint d'agrégats par commune).
- Écrire des tests (pytest-django ou TestCase DRF) pour les endpoints et les permissions.
- Générer le schéma du modèle de données (diagramme Mermaid / dbdiagram) et le SQL commenté.
- Rédiger la doc API, la doc d'installation, le post mortem, le plan de la présentation de 10 min.
- Déboguer une erreur Docker / GeoDjango / GDAL (je te colle les logs).

## Format de réponse attendu
Fichiers modifiés avec leur chemin, code complet, commandes à lancer (`docker compose exec backend ...`), comment vérifier que ça marche, message de commit `feat(back): ...`.

## Ma tâche
<décris ici la tâche précise>
