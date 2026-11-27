from rest_framework.routers import DefaultRouter

from .views import CommuneViewSet, DomaineViewSet, EquipementViewSet

router = DefaultRouter()
router.register("equipements", EquipementViewSet, basename="equipement")
router.register("domaines", DomaineViewSet, basename="domaine")
router.register("communes", CommuneViewSet, basename="commune")

urlpatterns = router.urls
