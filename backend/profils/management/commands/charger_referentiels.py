from django.core.cache import cache
from django.core.management.base import BaseCommand

from profils.models import Domaine
from scolarite.models import Classe, Cycle, Filiere


class Command(BaseCommand):
    help = "Charge les référentiels de base (cycles, classes, domaines)."

    def handle(self, *args, **options):
        filieres = {}
        for type_lycee, noms in (
            ("moderne", ("Générale", "Littéraire", "Scientifique")),
            ("technique", ("Électrotechnique", "Comptabilité", "Mécanique")),
        ):
            for ordre, nom in enumerate(noms, start=1):
                filieres[(type_lycee, nom)], _ = Filiere.objects.get_or_create(
                    type_lycee=type_lycee, nom=nom,
                    defaults={"ordre": ordre, "active": True},
                )
        cycles_data = [
            ("Maternelle", 1, [
                ("Petite Section", "", 1),
                ("Moyenne Section", "", 2),
                ("Grande Section", "", 3),
            ]),
            ("Primaire", 2, [
                ("CP1", "", 1),
                ("CP2", "", 2),
                ("CE1", "", 3),
                ("CE2", "", 4),
                ("CM1", "", 5),
                ("CM2", "", 6),
            ]),
            ("Collège", 3, [
                ("6ème", "", 1),
                ("5ème", "", 2),
                ("4ème", "", 3),
                ("3ème", "", 4),
            ]),
            ("Lycée", 4, [
                ("2nde", "Générale", 1),
                ("2nde A", "Littéraire", 2),
                ("2nde C", "Scientifique", 3),
                ("1ère A", "Littéraire", 4),
                ("1ère C", "Scientifique", 5),
                ("1ère D", "Scientifique", 6),
                ("Terminale A", "Littéraire", 7),
                ("Terminale C", "Scientifique", 8),
                ("Terminale D", "Scientifique", 9),
            ]),
        ]
        for nom_cycle, ordre_cycle, classes in cycles_data:
            cycle, _ = Cycle.objects.get_or_create(nom=nom_cycle, defaults={"ordre": ordre_cycle})
            if cycle.ordre != ordre_cycle:
                cycle.ordre = ordre_cycle
                cycle.save(update_fields=["ordre"])
            for nom_c, filiere_c, ordre_c in classes:
                Classe.objects.get_or_create(
                    cycle=cycle, nom=nom_c, filiere=filiere_c, defaults={"ordre": ordre_c}
                )
        lycee = Cycle.objects.get(nom="Lycée")
        for (_, nom_filiere), filiere in filieres.items():
            for ordre, nom_classe in enumerate(("2nde", "1ère", "Terminale"), start=1):
                classe, _ = Classe.objects.get_or_create(
                    cycle=lycee,
                    nom=nom_classe,
                    filiere=nom_filiere,
                    defaults={"ordre": ordre, "filiere_ref": filiere},
                )
                if classe.filiere_ref_id != filiere.pk:
                    classe.filiere_ref = filiere
                    classe.save(update_fields=["filiere_ref"])

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
