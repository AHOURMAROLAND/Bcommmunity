from django.core.cache import cache
from django.core.management.base import BaseCommand

from profils.models import Domaine
from scolarite.models import Classe, Cycle


class Command(BaseCommand):
    help = "Charge les référentiels de base (cycles, classes, domaines)."

    def handle(self, *args, **options):
        donnees = {
            "Maternelle": ["Petite section", "Moyenne section", "Grande section"],
            "Primaire": ["CP", "CE1", "CE2", "CM1", "CM2"],
            "Collège": ["6e", "5e", "4e", "3e"],
        }
        for ordre, (nom, classes) in enumerate(donnees.items()):
            cycle, _ = Cycle.objects.get_or_create(nom=nom, defaults={"ordre": ordre})
            for i, c in enumerate(classes):
                Classe.objects.get_or_create(cycle=cycle, nom=c, filiere="", defaults={"ordre": i})

        for ordre, (nom, filiere) in enumerate(
            [("Lycée moderne", "Moderne"), ("Lycée technique", "Technique")], start=3
        ):
            cycle, _ = Cycle.objects.get_or_create(nom=nom, defaults={"ordre": ordre})
            for i, c in enumerate(["2nde", "1ère", "Terminale"]):
                Classe.objects.get_or_create(cycle=cycle, nom=c, filiere=filiere, defaults={"ordre": i})

        domaines = [
            "Santé et médecine",
            "Droit",
            "Ingénierie",
            "Informatique",
            "Commerce et gestion",
            "Lettres et langues",
            "Sciences",
            "Éducation",
            "Agriculture",
            "Arts",
            "Autre",
        ]
        for d in domaines:
            Domaine.objects.get_or_create(nom=d)

        cache.delete("referentiels")
        self.stdout.write(self.style.SUCCESS("Référentiels chargés avec succès."))
