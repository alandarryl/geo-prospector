from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions, viewsets
from rest_framework_gis.filters import InBBoxFilter

from .models import Implantation
from .permissions import IsOwner
from .serializers import ImplantationSerializer, MeSerializer, RegisterSerializer


@extend_schema(parameters=[
    OpenApiParameter("in_bbox", str, description="Optionnel : min_lon,min_lat,max_lon,max_lat"),
])
class ImplantationViewSet(viewsets.ModelViewSet):
    """
    CRUD des implantations potentielles de l'utilisateur connecté.
    Privées : un utilisateur ne voit et ne modifie que les siennes
    (les autres renvoient 404, on ne révèle même pas leur existence).
    """
    serializer_class = ImplantationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    filter_backends = [InBBoxFilter]
    bbox_filter_field = "geom"

    def get_queryset(self):
        return (Implantation.objects
                .filter(user=self.request.user)
                .select_related("type_envisage__sous_domaine"))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RegisterView(generics.CreateAPIView):
    """Création de compte (username, email optionnel, mot de passe 8 caractères min)."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []


class MeView(generics.RetrieveAPIView):
    """Utilisateur connecté (le front l'appelle pour vérifier que le token est valide)."""
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user