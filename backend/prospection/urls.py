from rest_framework.routers import DefaultRouter

from .views import ImplantationViewSet

router = DefaultRouter()
router.register("implantations", ImplantationViewSet, basename="implantation")

urlpatterns = router.urls
