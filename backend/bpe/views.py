import math

from django.conf import settings
from django.contrib.gis.geos import Polygon
from django.db.models import Case, Count, IntegerField, Q, When
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_gis.filters import InBBoxFilter

from .models import Commune, Domaine, Equipement
from .serializers import (CommuneSerializer, DomaineArbreSerializer,
                          EquipementDetailSerializer, EquipementGeoSerializer)

FILTER_PARAMS = [
    OpenApiParameter("domaine", str, description="Codes domaines séparés par des virgules (ex: B,D)"),
    OpenApiParameter("sous_domaine", str, description="Codes sous-domaines (ex: B1,B2)"),
    OpenApiParameter("type", str, description="Codes types d'équipement (ex: B101,B102)"),
    OpenApiParameter("commune", str, description="Identifiants des communes (ex: 12,57) — voir /api/communes/"),
]


def _csv(request, name):
    """?domaine=B,C  ->  ['B', 'C']"""
    value = request.query_params.get(name, "")
    return [v.strip() for v in value.split(",") if v.strip()]


def tile_bbox(z, x, y):
    """Tuile slippy-map (z/x/y) -> (min_lon, min_lat, max_lon, max_lat) en WGS84."""
    n = 2 ** z

    def lon(xx):
        return xx / n * 360.0 - 180.0

    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return lon(x), lat(y + 1), lon(x + 1), lat(y)


def feature_collection(qs, limit):
    """
    Construit le GeoJSON à la main à partir de values_list :
    bien plus rapide que le serializer pour des milliers de points.
    """
    rows = list(qs.values_list(
        "id", "type_equipement_id", "type_equipement__sous_domaine__domaine_id", "nom", "geom"
    )[: limit + 1])
    truncated = len(rows) > limit
    features = [
        {
            "type": "Feature",
            "id": pk,
            "geometry": {"type": "Point", "coordinates": [round(g.x, 6), round(g.y, 6)]},
            "properties": {"id": pk, "type_code": t, "domaine": d, "nom": nom},
        }
        for pk, t, d, nom, g in rows[:limit]
    ]
    return {"type": "FeatureCollection", "truncated": truncated, "features": features}


class EquipementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Équipements BPE en GeoJSON.
    Deux façons de charger la carte :
      - /api/equipements/?in_bbox=...         (zone libre)
      - /api/equipements/tuiles/{z}/{x}/{y}/  (tuile fixe, mise en cache par le navigateur)
    """
    bbox_filter_field = "geom"
    filter_backends = [InBBoxFilter]
    bbox_filter_include_overlapping = True

    def get_serializer_class(self):
        return EquipementDetailSerializer if self.action == "retrieve" else EquipementGeoSerializer

    def get_queryset(self):
        qs = Equipement.objects.all()
        if self.action == "retrieve":
            return qs.select_related("type_equipement__sous_domaine__domaine", "commune")
        r = self.request
        domaines, sous_domaines, types = _csv(r, "domaine"), _csv(r, "sous_domaine"), _csv(r, "type")
        # Les 3 niveaux se combinent en OU (cocher "Commerces" + "Hypermarché" = union)
        if domaines or sous_domaines or types:
            q = Q()
            if domaines:
                q |= Q(type_equipement__sous_domaine__domaine__in=domaines)
            if sous_domaines:
                q |= Q(type_equipement__sous_domaine__in=sous_domaines)
            if types:
                q |= Q(type_equipement__in=types)
            qs = qs.filter(q)
        communes = [c for c in _csv(r, "commune") if c.isdigit()]
        if communes:
            qs = qs.filter(commune__in=communes)
        return qs

    @extend_schema(parameters=[
        OpenApiParameter("in_bbox", str, description="min_lon,min_lat,max_lon,max_lat (zone visible)"),
        *FILTER_PARAMS,
    ])
    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        return Response(feature_collection(qs, settings.BPE_MAX_FEATURES))

    @extend_schema(
        parameters=[
            OpenApiParameter("z", int, OpenApiParameter.PATH, description=f"Zoom (>= {settings.BPE_MIN_TILE_ZOOM})"),
            OpenApiParameter("x", int, OpenApiParameter.PATH),
            OpenApiParameter("y", int, OpenApiParameter.PATH),
            *FILTER_PARAMS,
        ],
        responses=OpenApiTypes.OBJECT,
    )
    @action(detail=False, url_path=r"tuiles/(?P<z>\d+)/(?P<x>\d+)/(?P<y>\d+)")
    def tuile(self, request, z, x, y):
        """
        Équipements d'une tuile (même découpage que les fonds de carte).
        Le front ne demande que les tuiles qu'il n'a pas encore : déplacer la carte
        ne charge que les éléments manquants. Réponse mise en cache 1 h.
        """
        z, x, y = int(z), int(x), int(y)
        if z < settings.BPE_MIN_TILE_ZOOM:
            return Response({"detail": f"Zoom minimum : {settings.BPE_MIN_TILE_ZOOM}"}, status=400)
        if not (0 <= x < 2 ** z and 0 <= y < 2 ** z):
            return Response({"detail": "Tuile invalide"}, status=400)
        bbox = Polygon.from_bbox(tile_bbox(z, x, y))
        bbox.srid = 4326
        # && (bboverlaps) utilise directement l'index spatial GiST
        qs = self.get_queryset().filter(geom__bboverlaps=bbox)
        response = Response(feature_collection(qs, settings.BPE_MAX_FEATURES))
        response["Cache-Control"] = "public, max-age=3600"
        return response


class DomaineViewSet(viewsets.ReadOnlyModelViewSet):
    """Arbre Domaine > Sous-domaine > Type (pour les filtres)."""
    queryset = Domaine.objects.prefetch_related("sous_domaines__types")
    serializer_class = DomaineArbreSerializer
    pagination_class = None


@extend_schema(parameters=[
    OpenApiParameter("q", str, description="Recherche par nom de commune (2 caractères min)"),
    OpenApiParameter("ids", str, description="Récupérer des communes précises (ex: 12,57)"),
])
class CommuneViewSet(viewsets.ReadOnlyModelViewSet):
    """Communes de la région (autocomplétion du filtre villes, emprise pour zoomer)."""
    serializer_class = CommuneSerializer

    def get_queryset(self):
        qs = Commune.objects.annotate(nb_equipements=Count("equipements"))
        if self.action == "retrieve":
            return qs
        ids = [i for i in _csv(self.request, "ids") if i.isdigit()]
        if ids:
            return qs.filter(id__in=ids)
        q = self.request.query_params.get("q", "").strip()
        if len(q) >= 2:
            # Les communes qui commencent par la recherche d'abord
            return (qs.filter(nom__icontains=q)
                    .annotate(prio=Case(When(nom__istartswith=q, then=0), default=1, output_field=IntegerField()))
                    .order_by("prio", "nom")[:50])
        return qs.order_by("-nb_equipements")[:50]