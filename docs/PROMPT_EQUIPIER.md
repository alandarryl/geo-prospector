# Prompt à coller dans Claude (équipier — partie Front)

> Copier tout le bloc ci-dessous dans une nouvelle conversation. Joindre si possible le PDF du sujet
> et les fichiers `frontend/src/App.jsx`, `frontend/src/api.js`, `README.md`.

---

Tu es mon binôme technique sur un projet de cours « Docker / Full Stack ». Je suis responsable du **frontend React** ; mon coéquipier gère le backend Django. Aide-moi à avancer étape par étape, en me donnant du code complet et prêt à coller, et en m'expliquant brièvement ce que fait chaque fichier. Réponds en français.

## Le projet
Application web d'exploration et de prospection commerciale géographique basée sur la **Base permanente des équipements (BPE 2025, INSEE)**, limitée à notre région. Fonctions :
1. **Carte publique** des équipements géolocalisés, navigation / zoom.
2. **Filtres** : par domaine sur 3 niveaux (Domaine → Sous-domaine → Type d'équipement, plusieurs choix possibles) et par une ou plusieurs villes.
3. **Détail** d'un équipement au clic.
4. **Chargement optimisé (exigence notée)** : on ne charge que ce qui est visible sur la carte ; déplacer la carte ne charge **que les éléments manquants**, en tenant compte des filtres.
5. **Implantations potentielles** (utilisateur connecté uniquement, privées) : ajouter un point sur la carte, saisir titre, type de commerce envisagé (classification BPE), annotations, commentaire ; modifier, supprimer ; les retrouver à la connexion suivante.

## Stack imposée
- Front : **React 19 + Vite + MapLibre GL JS** (JavaScript, pas TypeScript). Pas de librairie wrapper type react-map-gl sauf si je la demande.
- Back (fait par mon coéquipier, je ne le modifie pas) : Django + GeoDjango + Django REST Framework + PostGIS.
- Tout tourne en Docker : `docker compose up -d`. Le front est dans un container `node:24-alpine`, code monté en volume (hot reload), accessible sur http://localhost:5173. Vite proxifie `/api` vers Django → **toujours appeler des URLs relatives `/api/...`**.
- Pour ajouter un paquet npm : `docker compose exec frontend npm install <paquet>` (pas de npm en local).

## Structure existante du front
```
frontend/
├── package.json          # react, react-dom, maplibre-gl, vite
├── vite.config.js        # proxy /api -> backend:8000
├── index.html
└── src/
    ├── main.jsx          # monte <App/>, importe maplibre-gl.css
    ├── App.jsx           # carte MapLibre (fond OSM raster), source GeoJSON "equipements",
    │                     # recharge tout à chaque moveend (À REMPLACER), popup basique
    ├── api.js            # apiGet(path, params), apiSend(method, path, body) avec JWT
    │                     # depuis localStorage("access"), fetchEquipements(bbox, filters)
    └── index.css         # layout sidebar (300px) + carte
```
Structure cible que je souhaite :
```
src/
├── api.js
├── App.jsx                     # layout + état global (filtres, user)
├── components/
│   ├── MapView.jsx             # carte, couches, clic, mode "ajout d'implantation"
│   ├── FiltersPanel.jsx        # arbre domaines (cases à cocher 3 niveaux) + villes
│   ├── CommuneSelect.jsx       # autocomplétion multi-villes
│   ├── EquipementPopup.jsx     # détail
│   ├── AuthPanel.jsx           # login / inscription / logout
│   └── ImplantationForm.jsx    # création / édition
├── hooks/
│   ├── useAuth.js
│   └── useTileLoader.js        # chargement incrémental
└── utils/tiles.js              # calcul des tuiles visibles
```

## Contrat d'API (fourni par le back — ne pas inventer d'autres endpoints)
Toutes les réponses géographiques sont en **GeoJSON** (FeatureCollection / Feature), coordonnées `[lon, lat]` WGS84.

| Méthode | Endpoint | Auth | Réponse |
|---|---|---|---|
| GET | `/api/equipements/?in_bbox=minLon,minLat,maxLon,maxLat&domaine=B,C&sous_domaine=B1&type=B101&commune=76540,14118` | non | FeatureCollection, properties : `id, type_code, domaine, nom`. Max 5000 résultats. Les filtres domaine/sous_domaine/type se combinent en **OU** ; commune en ET avec le reste. |
| GET | `/api/equipements/{id}/` | non | Feature, properties : `nom, adresse, type_equipement{code,libelle}, sous_domaine, domaine, commune{code_insee,nom,departement}, qualite_geoloc, annee` |
| GET | `/api/domaines/` | non | `[{code, libelle, sous_domaines:[{code, libelle, types:[{code, libelle}]}]}]` |
| GET | `/api/communes/?q=texte` | non | `[{code_insee, nom, departement}]` (50 max) |
| POST | `/api/auth/register/` | non | body `{username, email, password}` (8 caractères min) |
| POST | `/api/auth/token/` | non | body `{username, password}` → `{access, refresh}` |
| POST | `/api/auth/token/refresh/` | non | body `{refresh}` → `{access}` |
| GET / POST | `/api/implantations/` | **Bearer** | FeatureCollection / création. Body POST : `{"type":"Feature","geometry":{"type":"Point","coordinates":[lon,lat]},"properties":{"titre":"...","type_envisage":"B101","annotations":"...","commentaire":"..."}}` |
| GET / PATCH / PUT / DELETE | `/api/implantations/{id}/` | **Bearer** | idem, l'utilisateur ne voit que ses points |

Doc Swagger interactive : http://localhost:8000/api/docs/. Si un format ne correspond pas, je préviens mon coéquipier au lieu de contourner côté front.

## Mes tâches (dans cet ordre, une branche Git par tâche)
1. `feature/front-structure` : découper App.jsx en composants selon la structure cible, sans changer le comportement.
2. `feature/front-chargement` : **chargement incrémental**. Approche souhaitée : découper la vue en tuiles (ex. grille slippy-map à un zoom fixe comme 13 ou 14), garder un cache `Map<clé_filtres, Set<tileId>>` + un `Map<id, feature>` des features déjà chargées ; à chaque `moveend`, ne requêter que les tuiles non encore chargées (une requête `in_bbox` par tuile ou par groupe), fusionner sans doublons (par `id`) puis `setData`. Quand les filtres changent, on vide le cache. Annuler les requêtes obsolètes avec `AbortController`. En dessous d'un certain zoom (ex. < 10), ne pas charger et afficher un message « Zoomez pour voir les équipements ». Activer le **clustering** de la source GeoJSON MapLibre.
3. `feature/front-filtres` : panneau avec arbre à 3 niveaux (cases à cocher, cocher un parent coche ses enfants, état « indéterminé »), envoi des codes au format CSV ; sélection multi-villes avec autocomplétion (debounce 300 ms) ; bouton « zoomer sur les villes sélectionnées » si possible.
4. `feature/front-detail` : au clic sur un point, appeler `/api/equipements/{id}/` et afficher un popup propre. Couleur des points par domaine.
5. `feature/front-auth` : inscription, connexion, stockage `access`/`refresh` dans localStorage, refresh automatique sur 401, déconnexion.
6. `feature/front-implantations` : couche distincte (autre couleur/icône) pour mes implantations, chargées après connexion ; bouton « Ajouter une implantation » → clic sur la carte → formulaire (titre, type envisagé choisi dans l'arbre BPE, annotations, commentaire) ; édition et suppression depuis le popup ; déplacement du point si possible (marker draggable).
7. `docs/utilisation` : section « Utilisation » du README avec captures.

## Règles de travail Git (on est deux collaborateurs sur GitHub)
- Branches : `main` (rendu final, seule branche notée), `test` (intégration), `feature/front-*` pour moi.
- Je pars toujours de `test` à jour : `git checkout test && git pull && git checkout -b feature/front-xxx`.
- Je merge régulièrement `origin/test` dans ma branche pour récupérer le travail du back, puis Pull Request vers `test`. On teste ensemble avant la PR `test` → `main`.
- Je ne modifie pas `backend/`. Je préviens avant de toucher `docker-compose.yaml`, `README.md` ou `.env.example`.
- Commits : `feat(front): ...`, `fix(front): ...`.

## Ce que j'attends de toi
- Commence par me confirmer que tu as compris, puis attaque la tâche 1 (ou celle que je t'indique).
- Pour chaque tâche : liste des fichiers créés/modifiés, code complet de chaque fichier, commandes à lancer, comment tester dans le navigateur, et le message de commit.
- Code simple, lisible, commenté en français, composants fonctionnels + hooks, pas de sur-ingénierie (pas de Redux).
- Si une info te manque (format exact de réponse, comportement), demande-moi au lieu d'inventer.
