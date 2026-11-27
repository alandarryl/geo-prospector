# Workflow Git

```
feature/back-xxx  ─┐
                   ├──► test ──(recette à deux)──► main   (seule main fait foi)
feature/front-xxx ─┘
```

- `main` : version rendue, toujours fonctionnelle. Jamais de commit direct.
- `test` : intégration. On y merge les features pour tester ensemble.
- `feature/back-<sujet>` / `feature/front-<sujet>` : une branche par tâche, courte durée.

## Démarrer une tâche
```bash
git checkout test
git pull origin test
git checkout -b feature/front-filtres-domaines
```

## Pendant la tâche
```bash
git add -A
git commit -m "feat(front): arbre de filtres domaines"
git push -u origin feature/front-filtres-domaines
```
Convention de messages : `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` + `(back)`/`(front)`.

## Récupérer le travail de l'autre (souvent !)
```bash
git checkout feature/ma-branche
git fetch origin
git merge origin/test         # résoudre les conflits ici, pas dans test
```
Après un pull qui contient des migrations : `docker compose exec backend python manage.py migrate`.
Après un pull qui modifie `requirements.txt` : `docker compose up -d --build backend`.
Après un pull qui modifie `package.json` : `docker compose restart frontend`.

## Intégrer dans test
1. GitHub → *New Pull Request* : `feature/...` → `test`
2. L'autre relit rapidement puis *Merge*
3. Chacun : `git checkout test && git pull`, on teste l'app

## Passer en production (main)
Quand `test` est validé à deux : Pull Request `test` → `main`, merge, puis
```bash
git checkout main && git pull
git tag v1.0 && git push --tags   # optionnel, pour le rendu
```

## Règles anti-conflits
- Le Back ne touche pas `frontend/`, le Front ne touche pas `backend/` (sauf accord).
- Fichiers partagés (`README.md`, `docker-compose.yaml`, `.env.example`) : prévenir avant de modifier.
- Migrations Django : créées uniquement par la personne Back.
- Jamais de `git push --force` sur `test` ou `main`.
