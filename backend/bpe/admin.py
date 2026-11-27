from django.contrib.gis import admin

from .models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement

admin.site.register(Domaine)
admin.site.register(SousDomaine)
admin.site.register(TypeEquipement)


@admin.register(Commune)
class CommuneAdmin(admin.ModelAdmin):
    search_fields = ["nom", "code_insee"]
    list_display = ["code_insee", "nom", "departement"]


@admin.register(Equipement)
class EquipementAdmin(admin.GISModelAdmin):
    list_display = ["id", "type_equipement", "commune", "nom"]
    list_filter = ["type_equipement__sous_domaine__domaine"]
    raw_id_fields = ["type_equipement", "commune"]
