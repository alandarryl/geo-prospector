"""
Données utilisateur, stockées indépendamment du référentiel BPE.
Chaque implantation est privée : visible uniquement par son auteur.
"""
from django.conf import settings
from django.contrib.gis.db import models

from bpe.models import TypeEquipement


class Implantation(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="implantations")
    titre = models.CharField(max_length=200)
    # Type de commerce envisagé, dans la classification BPE
    type_envisage = models.ForeignKey(TypeEquipement, on_delete=models.SET_NULL, null=True, blank=True)
    annotations = models.TextField(blank=True)
    commentaire = models.TextField(blank=True)
    geom = models.PointField(srid=4326)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.titre} ({self.user})"
