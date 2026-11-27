"""
Import du fichier parquet BPE (fichier plat) vers le modèle relationnel.

Usage :
    docker compose exec backend python manage.py import_bpe --inspect   # voir les colonnes du fichier
    docker compose exec backend python manage.py import_bpe             # import (région du .env)
    docker compose exec backend python manage.py import_bpe --region 28 --reset

⚠️ Les noms de colonnes varient selon la version du fichier.
   Lancez d'abord --inspect, puis ajustez COLUMN_CANDIDATES si besoin.
"""
import pandas as pd
from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from bpe.models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement

# Pour chaque champ logique : liste des noms de colonnes possibles (le premier trouvé est utilisé)
COLUMN_CANDIDATES = {
    "region": ["REG", "reg", "region"],
    "departement": ["DEP", "dep"],
    "code_commune": ["DEPCOM", "depcom", "CODGEO", "codgeo"],
    "nom_commune": ["LIBCOM", "libcom", "NOMCOM", "LIBGEO"],
    "domaine": ["DOM", "dom"],
    "domaine_lib": ["LIB_DOM", "DOM_LIB", "lib_dom", "libelle_domaine"],
    "sous_domaine": ["SDOM", "sdom"],
    "sous_domaine_lib": ["LIB_SDOM", "SDOM_LIB", "lib_sdom", "libelle_sous_domaine"],
    "type": ["TYPEQU", "typequ"],
    "type_lib": ["LIB_TYPEQU", "TYPEQU_LIB", "lib_typequ", "libelle_type"],
    "nom": ["NOMRS", "nomrs", "NOM"],
    "num_voie": ["NUMVOIE", "numvoie"],
    "type_voie": ["TYPVOIE", "typvoie"],
    "lib_voie": ["LIBVOIE", "libvoie"],
    "code_postal": ["CODPOS", "codpos"],
    "longitude": ["LONGITUDE", "longitude", "lon"],
    "latitude": ["LATITUDE", "latitude", "lat"],
    "lambert_x": ["LAMBERT_X", "lambert_x"],
    "lambert_y": ["LAMBERT_Y", "lambert_y"],
    "qualite": ["QUALITE_XY", "qualite_xy"],
    "annee": ["AN", "an", "annee"],
}

BATCH = 5000


def resolve_columns(df_columns):
    cols = {}
    for key, candidates in COLUMN_CANDIDATES.items():
        cols[key] = next((c for c in candidates if c in df_columns), None)
    return cols


def val(row, cols, key, default=""):
    c = cols.get(key)
    if not c:
        return default
    v = row[c]
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return default
    return str(v).strip()


class Command(BaseCommand):
    help = "Importe la BPE (parquet) filtrée sur une région dans PostGIS"

    def add_arguments(self, parser):
        parser.add_argument("--path", default=settings.BPE_PARQUET_PATH)
        parser.add_argument("--region", default=settings.BPE_REGION)
        parser.add_argument("--reset", action="store_true", help="Vide les tables BPE avant import")
        parser.add_argument("--inspect", action="store_true", help="Affiche les colonnes et 5 lignes")

    def handle(self, *args, **opts):
        path, region = opts["path"], str(opts["region"])
        try:
            df = pd.read_parquet(path)
        except FileNotFoundError:
            raise CommandError(f"Fichier introuvable : {path} (placez-le dans ./data/)")

        if opts["inspect"]:
            self.stdout.write(f"{len(df)} lignes\nColonnes : {list(df.columns)}")
            self.stdout.write(str(df.head()))
            return

        cols = resolve_columns(df.columns)
        for required in ("region", "code_commune", "domaine", "sous_domaine", "type"):
            if not cols[required]:
                raise CommandError(f"Colonne '{required}' introuvable. Lancez --inspect et adaptez COLUMN_CANDIDATES.")
        if not (cols["longitude"] and cols["latitude"]) and not (cols["lambert_x"] and cols["lambert_y"]):
            raise CommandError("Aucune colonne de coordonnées trouvée.")

        # 1) Filtre région
        df = df[df[cols["region"]].astype(str).str.zfill(2) == region.zfill(2)]
        self.stdout.write(f"{len(df)} équipements pour la région {region}")
        if df.empty:
            return

        with transaction.atomic():
            if opts["reset"]:
                Equipement.objects.all().delete()
                Commune.objects.all().delete()
                TypeEquipement.objects.all().delete()
                SousDomaine.objects.all().delete()
                Domaine.objects.all().delete()

            # 2) Tables de référence (dé-normalisation -> normalisation)
            self._import_nomenclature(df, cols)
            self._import_communes(df, cols, region)
            # 3) Équipements
            self._import_equipements(df, cols)

        self.stdout.write(self.style.SUCCESS("Import terminé ✅"))

    def _import_nomenclature(self, df, cols):
        def lib(row, key, code_key):
            return val(row, cols, key) or val(row, cols, code_key)

        doms, sdoms, types = {}, {}, {}
        for _, row in df.drop_duplicates(subset=[cols["type"]]).iterrows():
            d, sd, t = val(row, cols, "domaine"), val(row, cols, "sous_domaine"), val(row, cols, "type")
            doms[d] = lib(row, "domaine_lib", "domaine")
            sdoms[sd] = (lib(row, "sous_domaine_lib", "sous_domaine"), d)
            types[t] = (lib(row, "type_lib", "type"), sd)

        Domaine.objects.bulk_create([Domaine(code=k, libelle=v) for k, v in doms.items()],
                                    update_conflicts=True, unique_fields=["code"], update_fields=["libelle"])
        SousDomaine.objects.bulk_create([SousDomaine(code=k, libelle=l, domaine_id=d) for k, (l, d) in sdoms.items()],
                                        update_conflicts=True, unique_fields=["code"], update_fields=["libelle", "domaine"])
        TypeEquipement.objects.bulk_create([TypeEquipement(code=k, libelle=l, sous_domaine_id=s) for k, (l, s) in types.items()],
                                           update_conflicts=True, unique_fields=["code"], update_fields=["libelle", "sous_domaine"])
        self.stdout.write(f"  {len(doms)} domaines, {len(sdoms)} sous-domaines, {len(types)} types")

    def _import_communes(self, df, cols, region):
        communes = []
        for _, row in df.drop_duplicates(subset=[cols["code_commune"]]).iterrows():
            code = val(row, cols, "code_commune")
            communes.append(Commune(
                code_insee=code,
                nom=val(row, cols, "nom_commune") or code,
                departement=val(row, cols, "departement") or code[:2],
                region=region,
            ))
        Commune.objects.bulk_create(communes, update_conflicts=True, unique_fields=["code_insee"],
                                    update_fields=["nom", "departement", "region"])
        self.stdout.write(f"  {len(communes)} communes")

    def _import_equipements(self, df, cols):
        use_wgs84 = bool(cols["longitude"] and cols["latitude"])
        batch, total, skipped = [], 0, 0
        for _, row in df.iterrows():
            try:
                if use_wgs84:
                    geom = Point(float(row[cols["longitude"]]), float(row[cols["latitude"]]), srid=4326)
                else:  # Lambert 93 -> WGS84
                    geom = Point(float(row[cols["lambert_x"]]), float(row[cols["lambert_y"]]), srid=2154)
                    geom.transform(4326)
            except (TypeError, ValueError):
                skipped += 1
                continue
            if pd.isna(geom.x) or pd.isna(geom.y):
                skipped += 1
                continue

            adresse = " ".join(filter(None, [val(row, cols, "num_voie"), val(row, cols, "type_voie"),
                                             val(row, cols, "lib_voie"), val(row, cols, "code_postal")]))
            annee = val(row, cols, "annee")
            batch.append(Equipement(
                type_equipement_id=val(row, cols, "type"),
                commune_id=val(row, cols, "code_commune"),
                nom=val(row, cols, "nom")[:255],
                adresse=adresse[:500],
                qualite_geoloc=val(row, cols, "qualite")[:50],
                annee=int(float(annee)) if annee else None,
                geom=geom,
            ))
            if len(batch) >= BATCH:
                Equipement.objects.bulk_create(batch)
                total += len(batch)
                batch = []
                self.stdout.write(f"  ... {total}")
        if batch:
            Equipement.objects.bulk_create(batch)
            total += len(batch)
        self.stdout.write(f"  {total} équipements importés ({skipped} ignorés sans coordonnées)")
