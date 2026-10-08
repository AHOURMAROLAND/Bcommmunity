from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from comptes.models import Activite


class Command(BaseCommand):
    help = "Supprime les entrées du journal d'activité plus anciennes que N jours (365 par défaut)."

    def add_arguments(self, parser):
        parser.add_argument("--jours", type=int, default=365)

    def handle(self, *args, **options):
        limite = timezone.now() - timedelta(days=options["jours"])
        n, _ = Activite.objects.filter(cree_le__lt=limite).delete()
        self.stdout.write(f"{n} entrée(s) supprimée(s).")
