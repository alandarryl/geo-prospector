from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Implantation


class ImplantationSerializer(GeoFeatureModelSerializer):
    type_envisage_libelle = serializers.CharField(source="type_envisage.libelle", read_only=True, default=None)
    domaine = serializers.CharField(source="type_envisage.sous_domaine.domaine_id", read_only=True, default=None)

    class Meta:
        model = Implantation
        geo_field = "geom"
        fields = ["id", "titre", "type_envisage", "type_envisage_libelle", "domaine",
                  "annotations", "commentaire", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_geom(self, geom):
        if geom.srid not in (None, 4326):
            geom.transform(4326)
        geom.srid = 4326
        if not (-180 <= geom.x <= 180 and -90 <= geom.y <= 90):
            raise serializers.ValidationError("Coordonnées invalides (attendu [lon, lat] en WGS84).")
        return geom

    def validate_titre(self, titre):
        titre = titre.strip()
        if not titre:
            raise serializers.ValidationError("Le titre est obligatoire.")
        return titre


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Cet email est déjà utilisé.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class MeSerializer(serializers.ModelSerializer):
    nb_implantations = serializers.IntegerField(source="implantations.count", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "nb_implantations"]