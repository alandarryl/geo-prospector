from django.contrib.gis import admin

from .models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement

admin.site.register(Domaine)
admin.site.register(SousDomaine)


@admin.register(Commune)
class CommuneAdmin(admin.ModelAdmin):
    search_fields = ["nom", "departement"]
    list_display = ["id", "nom", "departement", "region"]
    list_filter = ["departement"]


@admin.register(Equipement)
class EquipementAdmin(admin.GISModelAdmin):
    list_display = ["id", "bpe_id", "type_equipement", "commune", "nom"]
    list_filter = ["type_equipement__sous_domaine__domaine"]
    raw_id_fields = ["type_equipement", "commune"]