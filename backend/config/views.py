from django.db import connection
from django.http import JsonResponse

from bpe.models import Equipement


def health_view(request):
    """Vérifie la connexion BDD et retourne le nombre d'équipements BPE."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        nb_equipements = Equipement.objects.count()
        return JsonResponse({
            "status": "ok",
            "database": "connected",
            "nb_equipements": nb_equipements,
        })
    except Exception as exc:
        return JsonResponse({
            "status": "error",
            "database": "disconnected",
            "detail": str(exc),
        }, status=503)