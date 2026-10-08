from profils.models import Profil, SituationActuelle

from .models import User


def creer_compte(**donnees):
    """Crée un compte et son profil ; l'accès e-mail attend sa vérification OTP."""
    user = User.objects.create_user(**donnees)
    profil = Profil.objects.create(user=user)
    SituationActuelle.objects.create(profil=profil)
    return user
