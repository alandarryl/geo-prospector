"""
Modèle relationnel construit à partir du fichier plat parquet de la BPE.

Hiérarchie de la classification (3 niveaux) :
    Domaine (ex: B "Commerces")
      └─ SousDomaine (ex: B1 "Grandes surfaces")
           └─ TypeEquipement (ex: B101 "Hypermarché")

Un Equipement a un TypeEquipement et une Commune.
"""
from django.contrib.gis.db import models


class Domaine(models.Model):
    code = models.CharField(max_length=2, primary_key=True)
    libelle = models.CharField(max_length=255)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class SousDomaine(models.Model):
    code = models.CharField(max_length=3, primary_key=True)
    libelle = models.CharField(max_length=255)
    domaine = models.ForeignKey(Domaine, on_delete=models.CASCADE, related_name="sous_domaines")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class TypeEquipement(models.Model):
    code = models.CharField(max_length=4, primary_key=True)
    libelle = models.CharField(max_length=255)
    sous_domaine = models.ForeignKey(SousDomaine, on_delete=models.CASCADE, related_name="types")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class Commune(models.Model):
    code_insee = models.CharField(max_length=5, primary_key=True)
    nom = models.CharField(max_length=255, db_index=True)
    departement = models.CharField(max_length=3, db_index=True)
    region = models.CharField(max_length=2)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return f"{self.nom} ({self.code_insee})"


class Equipement(models.Model):
    type_equipement = models.ForeignKey(TypeEquipement, on_delete=models.PROTECT, related_name="equipements")
    commune = models.ForeignKey(Commune, on_delete=models.PROTECT, related_name="equipements")
    nom = models.CharField(max_length=255, blank=True)        # raison sociale si disponible
    adresse = models.CharField(max_length=500, blank=True)
    qualite_geoloc = models.CharField(max_length=50, blank=True)
    annee = models.PositiveSmallIntegerField(null=True, blank=True)
    # Point WGS84 + index spatial GiST (créé automatiquement par GeoDjango)
    geom = models.PointField(srid=4326, spatial_index=True)

    class Meta:
        indexes = [models.Index(fields=["type_equipement", "commune"])]

    def __str__(self):
        return f"{self.type_equipement_id} - {self.nom or 'sans nom'}"
