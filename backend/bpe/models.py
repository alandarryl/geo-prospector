"""
Modèle relationnel construit à partir du fichier plat parquet de la BPE 2025.

Colonnes du fichier source : _id, nom, adresse, codepostal, ville, dept, region,
domaine1_code/libelle, domaine2_code/libelle, domaine3_code/libelle, SIRET, lon, lat

Hiérarchie de la classification (3 niveaux) :
    Domaine          (domaine1, ex: "B"    Commerces)
      └─ SousDomaine (domaine2, ex: "B1"   Grandes surfaces)
           └─ TypeEquipement (domaine3, ex: "B101" Hypermarché)

Le fichier ne contient pas de code INSEE commune : une Commune est identifiée
par (nom, département).
"""
from django.contrib.gis.db import models


class Domaine(models.Model):
    code = models.CharField(max_length=10, primary_key=True)
    libelle = models.CharField(max_length=255)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class SousDomaine(models.Model):
    code = models.CharField(max_length=10, primary_key=True)
    libelle = models.CharField(max_length=255)
    domaine = models.ForeignKey(Domaine, on_delete=models.CASCADE, related_name="sous_domaines")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class TypeEquipement(models.Model):
    code = models.CharField(max_length=10, primary_key=True)
    libelle = models.CharField(max_length=255)
    sous_domaine = models.ForeignKey(SousDomaine, on_delete=models.CASCADE, related_name="types")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class Commune(models.Model):
    nom = models.CharField(max_length=255, db_index=True)
    departement = models.CharField(max_length=3, db_index=True)
    region = models.CharField(max_length=100)

    class Meta:
        ordering = ["nom"]
        constraints = [
            models.UniqueConstraint(fields=["nom", "departement"], name="commune_unique_nom_dept"),
        ]

    def __str__(self):
        return f"{self.nom} ({self.departement})"


class Equipement(models.Model):
    bpe_id = models.CharField(max_length=64, unique=True)          # _id du fichier source
    type_equipement = models.ForeignKey(TypeEquipement, on_delete=models.PROTECT, related_name="equipements")
    commune = models.ForeignKey(Commune, on_delete=models.PROTECT, related_name="equipements")
    nom = models.CharField(max_length=255, blank=True)
    adresse = models.CharField(max_length=500, blank=True)
    code_postal = models.CharField(max_length=5, blank=True)
    siret = models.CharField(max_length=14, blank=True)
    # Point WGS84 + index spatial GiST (créé automatiquement par GeoDjango)
    geom = models.PointField(srid=4326, spatial_index=True)

    class Meta:
        indexes = [models.Index(fields=["type_equipement", "commune"])]

    def __str__(self):
        return f"{self.type_equipement_id} - {self.nom or 'sans nom'}"