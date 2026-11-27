from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement


class TypeEquipementSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeEquipement
        fields = ["code", "libelle"]


class SousDomaineSerializer(serializers.ModelSerializer):
    types = TypeEquipementSerializer(many=True, read_only=True)

    class Meta:
        model = SousDomaine
        fields = ["code", "libelle", "types"]


class DomaineArbreSerializer(serializers.ModelSerializer):
    """Arbre complet des 3 niveaux, pour construire les filtres du front."""
    sous_domaines = SousDomaineSerializer(many=True, read_only=True)

    class Meta:
        model = Domaine
        fields = ["code", "libelle", "sous_domaines"]


class CommuneSerializer(serializers.ModelSerializer):
    nb_equipements = serializers.IntegerField(read_only=True)

    class Meta:
        model = Commune
        fields = ["id", "nom", "departement", "bbox", "nb_equipements"]


class EquipementGeoSerializer(GeoFeatureModelSerializer):
    """Version légère pour la carte (GeoJSON)."""
    type_code = serializers.CharField(source="type_equipement_id")
    domaine = serializers.CharField(source="type_equipement.sous_domaine.domaine_id")

    class Meta:
        model = Equipement
        geo_field = "geom"
        fields = ["id", "type_code", "domaine", "nom"]


class CommuneCourteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commune
        fields = ["id", "nom", "departement"]


class EquipementDetailSerializer(GeoFeatureModelSerializer):
    """Détail complet quand on clique sur un équipement."""
    type_equipement = TypeEquipementSerializer(read_only=True)
    sous_domaine = serializers.CharField(source="type_equipement.sous_domaine.libelle")
    domaine = serializers.CharField(source="type_equipement.sous_domaine.domaine.libelle")
    commune = CommuneCourteSerializer(read_only=True)

    class Meta:
        model = Equipement
        geo_field = "geom"
        fields = ["id", "nom", "adresse", "code_postal", "siret", "type_equipement",
                  "sous_domaine", "domaine", "commune"]