"""
Import du fichier parquet BPE 2025 (nettoyé) vers le modèle relationnel.

Usage :
    docker compose exec backend python manage.py import_bpe --inspect   # colonnes + valeurs de "region"
    docker compose exec backend python manage.py import_bpe --reset     # import de la région du .env
    docker compose exec backend python manage.py import_bpe --region 28 --reset

Le fichier (~2,9 M lignes) est lu par paquets pour limiter la mémoire :
seules les lignes de la région sont gardées.
"""
import unicodedata

import pandas as pd
import pyarrow.parquet as pq
from django.conf import settings
from django.contrib.gis.db.models import Extent
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from bpe.models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement

# Codes région INSEE -> libellé (au cas où la colonne "region" contient le nom)
REGIONS = {
    "01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion", "06": "Mayotte",
    "11": "Île-de-France", "24": "Centre-Val de Loire", "27": "Bourgogne-Franche-Comté",
    "28": "Normandie", "32": "Hauts-de-France", "44": "Grand Est", "52": "Pays de la Loire",
    "53": "Bretagne", "75": "Nouvelle-Aquitaine", "76": "Occitanie",
    "84": "Auvergne-Rhône-Alpes", "93": "Provence-Alpes-Côte d'Azur", "94": "Corse",
}

COLUMNS = ["_id", "nom", "adresse", "codepostal", "ville", "dept", "region",
           "domaine1_code", "domaine1_libelle", "domaine2_code", "domaine2_libelle",
           "domaine3_code", "domaine3_libelle", "SIRET", "lon", "lat"]

BATCH_READ = 200_000   # lignes lues à la fois dans le parquet
BATCH_WRITE = 5_000    # lignes insérées à la fois en base


def normalize(value):
    """'Provence-Alpes-Côte d'Azur' -> 'provence alpes cote d azur' ; 28.0 -> '28'"""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip()
    if s.endswith(".0"):
        s = s[:-2]
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    for ch in "-'’_":
        s = s.replace(ch, " ")
    return " ".join(s.split())


def clean(value, max_len=None):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip()
    if s.endswith(".0") and s[:-2].isdigit():   # SIRET / code postal lus comme float
        s = s[:-2]
    return s[:max_len] if max_len else s


class Command(BaseCommand):
    help = "Importe la BPE (parquet) filtrée sur une région dans PostGIS"

    def add_arguments(self, parser):
        parser.add_argument("--path", default=settings.BPE_PARQUET_PATH)
        parser.add_argument("--region", default=settings.BPE_REGION, help="Code région INSEE (ex: 28)")
        parser.add_argument("--reset", action="store_true", help="Vide les tables BPE avant import")
        parser.add_argument("--inspect", action="store_true", help="Affiche colonnes, types et régions")
        parser.add_argument("--emprises", action="store_true",
                            help="Recalcule seulement l'emprise (bbox) des communes, sans réimporter")

    def handle(self, *args, **opts):
        path = opts["path"]
        try:
            pfile = pq.ParquetFile(path)
        except FileNotFoundError:
            raise CommandError(f"Fichier introuvable : {path} (placez-le dans ./data/)")

        if opts["inspect"]:
            return self._inspect(pfile)
        if opts["emprises"]:
            self._compute_emprises()
            return

        missing = set(COLUMNS) - set(pfile.schema_arrow.names)
        if missing:
            raise CommandError(f"Colonnes manquantes dans le fichier : {missing}")

        code = str(opts["region"]).zfill(2)
        # Valeurs acceptées dans la colonne "region" : le code ("28") ou le nom ("normandie")
        accepted = {normalize(code), normalize(str(int(code))), normalize(REGIONS.get(code, ""))} - {""}

        df = self._read_region(pfile, accepted)
        self.stdout.write(f"{len(df)} équipements pour la région {code} ({REGIONS.get(code, '?')})")
        if df.empty:
            raise CommandError("Aucune ligne trouvée : lancez --inspect pour voir les valeurs de 'region'.")

        before = len(df)
        df = df.dropna(subset=["lon", "lat", "domaine3_code", "ville"])
        self.stdout.write(f"  {before - len(df)} lignes ignorées (sans coordonnées, type ou ville)")

        df = df.rename(columns={"_id": "bpe_id"})  # "_id" n'est pas utilisable avec itertuples

        with transaction.atomic():
            if opts["reset"]:
                self.stdout.write("  Suppression des anciennes données BPE...")
                Equipement.objects.all().delete()
                Commune.objects.all().delete()
                TypeEquipement.objects.all().delete()
                SousDomaine.objects.all().delete()
                Domaine.objects.all().delete()

            self._import_nomenclature(df)
            communes = self._import_communes(df, REGIONS.get(code, code))
            self._import_equipements(df, communes)
            self._compute_emprises()

        self.stdout.write(self.style.SUCCESS("Import terminé ✅"))

    # ------------------------------------------------------------------ #
    def _inspect(self, pfile):
        self.stdout.write(f"{pfile.metadata.num_rows} lignes\n")
        self.stdout.write("Colonnes et types :")
        for field in pfile.schema_arrow:
            self.stdout.write(f"  - {field.name}: {field.type}")
        regions = pfile.read(columns=["region"]).to_pandas()["region"]
        self.stdout.write("\nValeurs de 'region' (nombre de lignes) :")
        self.stdout.write(str(regions.value_counts(dropna=False).head(25)))
        sample = pfile.read_row_group(0).to_pandas().head(5)
        with pd.option_context("display.max_columns", None, "display.width", 250):
            self.stdout.write("\nExemple :")
            self.stdout.write(str(sample))

    def _read_region(self, pfile, accepted):
        parts = []
        for i, batch in enumerate(pfile.iter_batches(batch_size=BATCH_READ, columns=COLUMNS)):
            chunk = batch.to_pandas()
            mask = chunk["region"].map(normalize).isin(accepted)
            parts.append(chunk[mask])
            self.stdout.write(f"  lecture... {(i + 1) * BATCH_READ:,} lignes", ending="\r")
        self.stdout.write("")
        return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=COLUMNS)

    def _import_nomenclature(self, df):
        def lib(row, n):
            return clean(row[f"domaine{n}_libelle"], 255) or clean(row[f"domaine{n}_code"])

        doms, sdoms, types = {}, {}, {}
        for _, row in df.drop_duplicates(subset=["domaine3_code"]).iterrows():
            d, sd, t = clean(row["domaine1_code"]), clean(row["domaine2_code"]), clean(row["domaine3_code"])
            doms[d] = lib(row, 1)
            sdoms[sd] = (lib(row, 2), d)
            types[t] = (lib(row, 3), sd)

        Domaine.objects.bulk_create(
            [Domaine(code=k, libelle=v) for k, v in doms.items()],
            update_conflicts=True, unique_fields=["code"], update_fields=["libelle"])
        SousDomaine.objects.bulk_create(
            [SousDomaine(code=k, libelle=l, domaine_id=d) for k, (l, d) in sdoms.items()],
            update_conflicts=True, unique_fields=["code"], update_fields=["libelle", "domaine"])
        TypeEquipement.objects.bulk_create(
            [TypeEquipement(code=k, libelle=l, sous_domaine_id=s) for k, (l, s) in types.items()],
            update_conflicts=True, unique_fields=["code"], update_fields=["libelle", "sous_domaine"])
        self.stdout.write(f"  {len(doms)} domaines, {len(sdoms)} sous-domaines, {len(types)} types")

    def _import_communes(self, df, region_label):
        pairs = df[["ville", "dept"]].drop_duplicates()
        Commune.objects.bulk_create(
            [Commune(nom=clean(r.ville, 255), departement=clean(r.dept, 3), region=region_label)
             for r in pairs.itertuples()],
            ignore_conflicts=True)
        mapping = {(c.nom, c.departement): c.id for c in Commune.objects.all()}
        self.stdout.write(f"  {len(pairs)} communes")
        return mapping

    def _compute_emprises(self):
        """Emprise [min_lon, min_lat, max_lon, max_lat] des équipements de chaque commune."""
        extents = Equipement.objects.values("commune").annotate(ext=Extent("geom"))
        by_id = {e["commune"]: [round(v, 6) for v in e["ext"]] for e in extents if e["ext"]}
        communes = list(Commune.objects.all())
        for c in communes:
            c.bbox = by_id.get(c.id)
        Commune.objects.bulk_update(communes, ["bbox"], batch_size=1000)
        self.stdout.write(f"  emprise calculée pour {len(by_id)} communes")

    def _import_equipements(self, df, communes):
        batch, total = [], 0
        for r in df.itertuples(index=False):
            batch.append(Equipement(
                bpe_id=clean(r.bpe_id, 64),
                type_equipement_id=clean(r.domaine3_code),
                commune_id=communes[(clean(r.ville, 255), clean(r.dept, 3))],
                nom=clean(r.nom, 255),
                adresse=clean(r.adresse, 500),
                code_postal=clean(r.codepostal, 5),
                siret=clean(r.SIRET, 14),
                geom=Point(float(r.lon), float(r.lat), srid=4326),
            ))
            if len(batch) >= BATCH_WRITE:
                Equipement.objects.bulk_create(batch, ignore_conflicts=True)
                total += len(batch)
                batch = []
                self.stdout.write(f"  ... {total:,} équipements", ending="\r")
        if batch:
            Equipement.objects.bulk_create(batch, ignore_conflicts=True)
            total += len(batch)
        self.stdout.write(f"\n  {total:,} équipements importés")