"""
Presence Redis : qui est connecte au WebSocket (tolere 60 s apres la derniere activite).
Utilise le cache Django (Redis en production, memoire locale en dev/tests).
"""
import time

TTL = 60  # secondes


def _cle(uid):
    return f"presence:{uid}"


def _redis():
    try:
        from django_redis import get_redis_connection
        return get_redis_connection("default")
    except Exception:
        return None


def marquer_present(uid, canal):
    try:
        r = _redis()
        if r is None:
            return
        r.zadd(_cle(uid), {canal: time.time() + TTL})
        r.expire(_cle(uid), TTL * 2)
    except Exception:
        pass


def retirer_presence(uid, canal):
    try:
        r = _redis()
        if r:
            r.zrem(_cle(uid), canal)
    except Exception:
        pass


def presents(uids):
    """Retourne l'ensemble des uid actuellement connectes."""
    uids = list(uids)
    if not uids:
        return set()
    try:
        r = _redis()
        if r is None:
            return set()
        pipe = r.pipeline()
        now = time.time()
        for u in uids:
            pipe.zcount(_cle(u), now, "+inf")
        return {u for u, n in zip(uids, pipe.execute()) if n}
    except Exception:
        return set()
