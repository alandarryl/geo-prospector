"""
Tests auth + implantations privées.
Lancer :  docker compose exec backend python manage.py test prospection
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from bpe.models import Domaine, SousDomaine, TypeEquipement

from .models import Implantation


def feature(titre="Boulangerie quai", lon=-1.55, lat=47.21, **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"titre": titre, **props},
    }


class AuthTests(APITestCase):
    def test_inscription_puis_connexion(self):
        r = self.client.post("/api/auth/register/",
                             {"username": "alice", "email": "a@a.fr", "password": "MotDePasse123"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertNotIn("password", r.json())

        r = self.client.post("/api/auth/token/", {"username": "alice", "password": "MotDePasse123"}, format="json")
        self.assertEqual(r.status_code, 200)
        access = r.json()["access"]
        self.assertIn("refresh", r.json())

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        r = self.client.get("/api/auth/me/")
        self.assertEqual(r.json()["username"], "alice")

    def test_mot_de_passe_trop_court(self):
        r = self.client.post("/api/auth/register/", {"username": "bob", "password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_mauvais_mot_de_passe(self):
        User.objects.create_user("carl", password="MotDePasse123")
        r = self.client.post("/api/auth/token/", {"username": "carl", "password": "faux"}, format="json")
        self.assertEqual(r.status_code, 401)


class ImplantationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        d = Domaine.objects.create(code="B", libelle="Commerces")
        sd = SousDomaine.objects.create(code="B2", libelle="Commerces alimentaires", domaine=d)
        cls.type = TypeEquipement.objects.create(code="B207", libelle="Boulangerie", sous_domaine=sd)
        cls.alice = User.objects.create_user("alice", password="MotDePasse123")
        cls.bob = User.objects.create_user("bob", password="MotDePasse123")

    def setUp(self):
        self.client.force_authenticate(self.alice)

    def test_anonyme_refuse(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/implantations/").status_code, 401)
        self.assertEqual(self.client.post("/api/implantations/", feature(), format="json").status_code, 401)

    def test_creer_lister_modifier_supprimer(self):
        r = self.client.post("/api/implantations/",
                             feature(type_envisage="B207", annotations="Passage fort", commentaire="RDC libre"),
                             format="json")
        self.assertEqual(r.status_code, 201, r.json())
        pk = r.json()["id"]
        self.assertEqual(r.json()["properties"]["type_envisage_libelle"], "Boulangerie")
        self.assertEqual(r.json()["properties"]["domaine"], "B")

        r = self.client.get("/api/implantations/")
        self.assertEqual(len(r.json()["features"]), 1)

        r = self.client.patch(f"/api/implantations/{pk}/", {"properties": {"commentaire": "Bail signé"}},
                              format="json")
        self.assertEqual(r.status_code, 200, r.json())
        self.assertEqual(Implantation.objects.get(pk=pk).commentaire, "Bail signé")

        # Déplacement du point
        r = self.client.patch(f"/api/implantations/{pk}/",
                              {"properties": {}, "geometry": {"type": "Point", "coordinates": [-0.56, 47.47]}},
                              format="json")
        self.assertEqual(r.status_code, 200, r.json())
        self.assertAlmostEqual(Implantation.objects.get(pk=pk).geom.x, -0.56)

        self.assertEqual(self.client.delete(f"/api/implantations/{pk}/").status_code, 204)
        self.assertFalse(Implantation.objects.exists())

    def test_implantations_privees(self):
        imp = Implantation.objects.create(user=self.bob, titre="Secret de Bob",
                                          geom="SRID=4326;POINT(-1.55 47.21)")
        # Alice ne voit pas, ne modifie pas, ne supprime pas l'implantation de Bob
        self.assertEqual(len(self.client.get("/api/implantations/").json()["features"]), 0)
        self.assertEqual(self.client.get(f"/api/implantations/{imp.id}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/implantations/{imp.id}/",
                                           {"properties": {"titre": "pirate"}}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/implantations/{imp.id}/").status_code, 404)
        self.assertTrue(Implantation.objects.filter(pk=imp.id, titre="Secret de Bob").exists())

    def test_impossible_de_creer_pour_un_autre(self):
        r = self.client.post("/api/implantations/", {**feature(), "user": self.bob.id}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Implantation.objects.get().user, self.alice)

    def test_validation(self):
        r = self.client.post("/api/implantations/", feature(titre="   "), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/implantations/", feature(lon=500, lat=47), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/implantations/", feature(type_envisage="ZZZZ"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_filtre_bbox(self):
        self.client.post("/api/implantations/", feature("Nantes", -1.55, 47.21), format="json")
        self.client.post("/api/implantations/", feature("Angers", -0.56, 47.47), format="json")
        r = self.client.get("/api/implantations/", {"in_bbox": "-1.7,47.1,-1.4,47.3"})
        self.assertEqual([f["properties"]["titre"] for f in r.json()["features"]], ["Nantes"])