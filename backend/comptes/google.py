import cachecontrol
import requests
from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

# Session avec cache : les certificats de Google ne sont pas retéléchargés à chaque connexion.
_requete = google_requests.Request(session=cachecontrol.CacheControl(requests.session()))


def verifier(credential):
    """Vérifie signature, audience, émetteur et expiration du jeton Google."""
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google n'est pas configuré.")
    info = id_token.verify_oauth2_token(credential, _requete, settings.GOOGLE_CLIENT_ID)
    if not info.get("email_verified"):
        raise ValueError("Adresse e-mail Google non vérifiée.")
    return info
