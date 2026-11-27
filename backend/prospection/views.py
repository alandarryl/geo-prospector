from rest_framework import generics, permissions, viewsets

from .models import Implantation
from .permissions import IsOwner
from .serializers import ImplantationSerializer, RegisterSerializer


class ImplantationViewSet(viewsets.ModelViewSet):
    """CRUD des implantations potentielles de l'utilisateur connecté (privées)."""
    serializer_class = ImplantationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Implantation.objects.filter(user=self.request.user).select_related("type_envisage")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RegisterView(generics.CreateAPIView):
    """Création de compte."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
