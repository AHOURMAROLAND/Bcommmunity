from profils.models import Profil, SituationActuelle

from .models import User


def creer_compte(**donnees):
    """Crée un compte non validé avec son profil. Sans password, le mot de passe est inutilisable."""
    user = User.objects.create_user(**donnees)
    profil = Profil.objects.create(user=user)
    SituationActuelle.objects.create(profil=profil)
    return user
