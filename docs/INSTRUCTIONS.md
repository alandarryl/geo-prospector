# Instructions de démarrage (à suivre dans l'ordre)

## Étape 1 — Créer le dépôt (une seule personne : toi)
```bash
cd bpe-explorer
git init
git add .
git commit -m "chore: squelette initial docker + django + react"
git branch -M main
git remote add origin https://github.com/<vous>/bpe-explorer.git
git push -u origin main
git checkout -b test && git push -u origin test
```
Sur GitHub : Settings → Collaborators → ajouter l'équipier **et `rcarlier`** (le prof).
Settings → Branches → règle de protection sur `main` (Pull Request obligatoire).

## Étape 2 — Chacun lance le projet
```bash
git clone https://github.com/<vous>/bpe-explorer.git && cd bpe-explorer
cp .env.example .env            # mettre BPE_REGION
docker compose up -d --build
docker compose exec backend python manage.py makemigrations bpe prospection
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```
⚠️ Les fichiers de migration sont **commités une seule fois par la personne Back** :
l'autre fait seulement `migrate` après un `git pull`.

## Étape 3 — Importer la BPE
Placer le parquet dans `data/bpe.parquet` puis :
```bash
docker compose exec backend python manage.py import_bpe --inspect
docker compose exec backend python manage.py import_bpe --reset
```

## Étape 4 — Vérifier
- http://localhost:8000/api/docs/ → tester `GET /api/domaines/`
- http://localhost:5173 → des points s'affichent sur la carte

## Étape 5 — Travailler (voir GIT_WORKFLOW.md)
Une branche par fonctionnalité → PR vers `test` → test ensemble → PR `test` → `main`.

## Si on veut recréer le front/back « from scratch » (pour info)
Le squelette fourni remplace ces commandes, mais voici l'équivalent :
```bash
# React + Vite (via docker, sans Node local)
docker run --rm -it -v "$PWD":/app -w /app node:24-alpine npm create vite@latest frontend -- --template react
docker run --rm -it -v "$PWD/frontend":/app -w /app node:24-alpine npm install maplibre-gl
# Django
docker compose run --rm backend django-admin startproject config .
docker compose run --rm backend python manage.py startapp bpe
docker compose run --rm backend python manage.py startapp prospection
```

## Répartition
| Toi — Back & Données | Équipier — Front |
|---|---|
| Import parquet + modèle de données | Carte, chargement incrémental, clusters |
| API BPE (bbox, filtres, détail) | Filtres domaines 3 niveaux + multi-villes |
| Auth JWT + API implantations | Popup détail, login / inscription |
| Doc API (Swagger) + schéma BDD | Ajout / édition / suppression des implantations |
| Doc install + import | Doc d'utilisation (captures) |
| **Ensemble :** post mortem, présentation (10 min), recette finale sur `test` | |

## Contrat d'interface (à respecter des deux côtés)
Les endpoints listés dans le README sont le contrat. Toute modification de format
(nom de champ, paramètre) = prévenir l'autre + mettre à jour le README dans la même PR.
