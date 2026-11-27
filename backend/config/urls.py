from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from config.views import health_view
from prospection.views import RegisterView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_view, name="health"),
    # Auth
    path("api/auth/register/", RegisterView.as_view(), name="register"),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Métier
    path("api/", include("bpe.urls")),
    path("api/", include("prospection.urls")),
    # Documentation API (OpenAPI / Swagger)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
]