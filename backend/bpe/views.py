from django.conf import settings
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework_gis.filters import InBBoxFilter

from .models import Commune, Domaine, Equipement
from .serializers import (CommuneSerializer, DomaineArbreSerializer,
                          EquipementDetailSerializer, EquipementGeoSerializer)


def _csv(request, name):
    """?domaine=B,C  ->  ['B', 'C']"""
    value = request.query_params.get(name, "")
    return [v.strip() for v in value.split(",") if v.strip()]


@extend_schema(parameters=[
    OpenApiParameter("in_bbox", str, description="min_lon,min_lat,max_lon,max_lat (zone visible de la carte)"),
    OpenApiParameter("domaine", str, description="Codes domaines séparés par des virgules (ex: B,D)"),
    OpenApiParameter("sous_domaine", str, description="Codes sous-domaines (ex: B1,B2)"),
    OpenApiParameter("type", str, description="Codes types d'équipement (ex: B101,B102)"),
    OpenApiParameter("commune", str, description="IDs des communes séparés par des virgules (ex: 12,57)"),
])
class EquipementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Équipements BPE en GeoJSON.
    Le front envoie la bbox visible + les filtres : on ne renvoie que l'affichable.
    """
    bbox_filter_field = "geom"
    filter_backends = [InBBoxFilter]
    bbox_filter_include_overlapping = True

    def get_serializer_class(self):
        return EquipementDetailSerializer if self.action == "retrieve" else EquipementGeoSerializer

    def get_queryset(self):
        qs = Equipement.objects.select_related(
            "type_equipement__sous_domaine__domaine", "commune"
        )
        r = self.request
        domaines, sous_domaines, types = _csv(r, "domaine"), _csv(r, "sous_domaine"), _csv(r, "type")
        if domaines or sous_domaines or types:
            q = Q()
            if domaines:
                q |= Q(type_equipement__sous_domaine__domaine_id__in=domaines)
            if sous_domaines:
                q |= Q(type_equipement__sous_domaine_id__in=sous_domaines)
            if types:
                q |= Q(type_equipement_id__in=types)
            qs = qs.filter(q)
        communes = _csv(r, "commune")
        if communes:
            commune_ids = [int(c) for c in communes if c.isdigit()]
            qs = qs.filter(commune_id__in=commune_ids)
        return qs

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action == "list":
            qs = qs[: settings.BPE_MAX_FEATURES]
        return qs


class DomaineViewSet(viewsets.ReadOnlyModelViewSet):
    """Arbre Domaine > Sous-domaine > Type (pour les filtres)."""
    serializer_class = DomaineArbreSerializer
    pagination_class = None
    queryset = Domaine.objects.prefetch_related("sous_domaines__types")


@extend_schema(parameters=[OpenApiParameter("q", str, description="Recherche par nom ou département")])
class CommuneViewSet(viewsets.ReadOnlyModelViewSet):
    """Communes de la région (autocomplétion du filtre villes)."""
    serializer_class = CommuneSerializer

    def get_queryset(self):
        qs = Commune.objects.all()
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(nom__icontains=q) | Q(departement__istartswith=q))
        return qs[:50]