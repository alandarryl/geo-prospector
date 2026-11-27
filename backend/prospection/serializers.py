from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Implantation


class ImplantationSerializer(GeoFeatureModelSerializer):
    type_envisage_libelle = serializers.CharField(source="type_envisage.libelle", read_only=True, default=None)

    class Meta:
        model = Implantation
        geo_field = "geom"
        fields = ["id", "titre", "type_envisage", "type_envisage_libelle",
                  "annotations", "commentaire", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
