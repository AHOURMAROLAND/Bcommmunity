import uuid

from django.core import signing
from django.core.cache import cache

DUREE_JETON_REPONSE = 15 * 60
SEL_JETON_REPONSE = "notifications.android-reply.v1"


def creer_jeton_reponse(user_id, conversation_id, message_id):
    return signing.dumps(
        {
            "u": user_id,
            "c": conversation_id,
            "m": message_id,
            "n": uuid.uuid4().hex,
        },
        salt=SEL_JETON_REPONSE,
        compress=True,
    )


def lire_jeton_reponse(jeton):
    charge = signing.loads(jeton, salt=SEL_JETON_REPONSE, max_age=DUREE_JETON_REPONSE)
    if (
        not isinstance(charge, dict)
        or any(isinstance(charge.get(cle), bool) or not isinstance(charge.get(cle), int)
               for cle in ("u", "c", "m"))
        or not isinstance(charge.get("n"), str)
        or len(charge["n"]) != 32
    ):
        raise signing.BadSignature("Jeton de reponse invalide.")
    return charge


def consommer_jeton_reponse(nonce):
    return cache.add(f"notification-reply:used:{nonce}", True, DUREE_JETON_REPONSE)
