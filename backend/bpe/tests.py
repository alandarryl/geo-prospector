"""
Tests de l'API BPE.
Lancer :  docker compose exec backend python manage.py test bpe
"""
from django.contrib.gis.geos import Point
from rest_framework.test import APITestCase

from .models import Commune, Domaine, Equipement, SousDomaine, TypeEquipement
from .views import tile_bbox


class BpeApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        com = Domaine.objects.create(code="B", libelle="Commerces")
        sante = Domaine.objects.create(code="D", libelle="Santé")
        gs = SousDomaine.objects.create(code="B1", libelle="Grandes surfaces", domaine=com)
        med = SousDomaine.objects.create(code="D2", libelle="Professions médicales", domaine=sante)
        hyper = TypeEquipement.objects.create(code="B101", libelle="Hypermarché", sous_domaine=gs)
        medecin = TypeEquipement.objects.create(code="D201", libelle="Médecin", sous_domaine=med)
        cls.nantes = Commune.objects.create(nom="Nantes", departement="44", region="Pays de la Loire",
                                            bbox=[-1.64, 47.17, -1.47, 47.30])
        cls.angers = Commune.objects.create(nom="Angers", departement="49", region="Pays de la Loire")
        Equipement.objects.create(bpe_id="1", type_equipement=hyper, commune=cls.nantes,
                                  nom="Hyper Nantes", geom=Point(-1.5536, 47.2184, srid=4326))
        Equipement.objects.create(bpe_id="2", type_equipement=medecin, commune=cls.nantes,
                                  nom="Dr Nantes", geom=Point(-1.5500, 47.2150, srid=4326))
        Equipement.objects.create(bpe_id="3", type_equipement=hyper, commune=cls.angers,
                                  nom="Hyper Angers", geom=Point(-0.5632, 47.4784, srid=4326))

    def test_bbox(self):
        r = self.client.get("/api/equipements/", {"in_bbox": "-1.6,47.18,-1.5,47.25"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["features"]), 2)
        self.assertFalse(r.json()["truncated"])

    def test_filtre_domaine_et_type_en_ou(self):
        r = self.client.get("/api/equipements/", {"domaine": "D", "type": "B101"})
        self.assertEqual(len(r.json()["features"]), 3)
        r = self.client.get("/api/equipements/", {"domaine": "D"})
        self.assertEqual(len(r.json()["features"]), 1)

    def test_filtre_commune(self):
        r = self.client.get("/api/equipements/", {"commune": self.angers.id})
        noms = [f["properties"]["nom"] for f in r.json()["features"]]
        self.assertEqual(noms, ["Hyper Angers"])

    def test_tuile(self):
        # Tuile z13 qui contient le centre de Nantes
        z, x, y = 13, 4060, 2874
        min_lon, min_lat, max_lon, max_lat = tile_bbox(z, x, y)
        self.assertTrue(min_lon <= -1.5536 <= max_lon and min_lat <= 47.2184 <= max_lat)
        r = self.client.get(f"/api/equipements/tuiles/{z}/{x}/{y}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["features"]), 2)
        self.assertIn("max-age", r["Cache-Control"])

    def test_tuile_zoom_trop_faible(self):
        r = self.client.get("/api/equipements/tuiles/5/15/11/")
        self.assertEqual(r.status_code, 400)

    def test_detail(self):
        eq = Equipement.objects.get(bpe_id="1")
        r = self.client.get(f"/api/equipements/{eq.id}/")
        props = r.json()["properties"]
        self.assertEqual(props["type_equipement"]["libelle"], "Hypermarché")
        self.assertEqual(props["commune"]["nom"], "Nantes")

    def test_domaines_arbre(self):
        r = self.client.get("/api/domaines/")
        b = next(d for d in r.json() if d["code"] == "B")
        self.assertEqual(b["sous_domaines"][0]["types"][0]["code"], "B101")

    def test_communes(self):
        r = self.client.get("/api/communes/", {"q": "nan"})
        c = r.json()[0]
        self.assertEqual(c["nom"], "Nantes")
        self.assertEqual(c["nb_equipements"], 2)
        self.assertEqual(len(c["bbox"]), 4)
        r = self.client.get("/api/communes/", {"ids": f"{self.angers.id}"})
        self.assertEqual([c["nom"] for c in r.json()], ["Angers"])