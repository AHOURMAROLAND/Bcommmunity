from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from comptes.models import User
from comptes.services import creer_compte


class Command(BaseCommand):
    help = "Crée un utilisateur simple ou administrateur pour un environnement Docker/local."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--prenom", required=True)
        parser.add_argument("--nom", required=True)
        parser.add_argument("--password", help="À éviter en production : le mot de passe peut rester dans l'historique du terminal.")
        parser.add_argument("--admin", action="store_true", help="Crée un compte administrateur.")
        parser.add_argument("--valide", action="store_true", help="Marque le compte comme validé.")
        parser.add_argument("--email-verifie", action="store_true", help="Marque l'e-mail comme vérifié.")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f"Un compte existe déjà pour {email}.")

        password = options["password"]
        if password is None:
            password = getpass("Mot de passe : ")
            confirmation = getpass("Confirmez le mot de passe : ")
            if password != confirmation:
                raise CommandError("Les mots de passe ne correspondent pas.")
        if not password:
            raise CommandError("Le mot de passe ne peut pas être vide.")
        try:
            validate_password(password)
        except ValidationError as erreur:
            raise CommandError(" ".join(erreur.messages)) from erreur

        donnees = {
            "email": email,
            "prenom": options["prenom"].strip(),
            "nom": options["nom"].strip(),
            "password": password,
            "valide": bool(options["valide"]),
            "email_verifie": bool(options["email_verifie"]),
        }

        if options["admin"]:
            user = User.objects.create_superuser(**donnees)
            self.stdout.write(self.style.SUCCESS(f"Compte admin créé : {user.email}"))
            return

        user = creer_compte(**donnees)
        self.stdout.write(self.style.SUCCESS(f"Compte utilisateur créé : {user.email}"))
