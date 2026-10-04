import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import IntegrityError, transaction
from django.db.models import Max, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from amis.services import ids_bloques, profils_actifs
from notifications.services import evenement, lancer
from notifications.taches import pousser_message

from .models import Conversation, InvitationDiscussion, Message, Participant

logger = logging.getLogger(__name__)
DELAI_REFUS = timedelta(days=7)
MAX_EN_ATTENTE = 10
MAX_TEXTE = 2000


def cle(a, b):
    """Cle unique et deterministe pour une paire d'utilisateurs."""
    return f"{min(a, b)}-{max(a, b)}"


def diffuser(ids, data):
    """Envoie un evenement temps reel a une liste d'utilisateurs via Channels."""
    couche = get_channel_layer()
    if couche is None:
        return
    try:
        for uid in set(ids):
            async_to_sync(couche.group_send)(f"user_{uid}", {"type": "evenement", "data": data})
    except Exception:
        logger.exception("Diffusion temps reel impossible")


def resume(u):
    """Serialisation legere d'un utilisateur pour les reponses API."""
    p = getattr(u, "profil", None)
    return {
        "id": u.pk,
        "prenom": u.prenom,
        "nom": u.nom,
        "statut": u.statut,
        "annee_sortie": p.annee_sortie if p else None,
        "photo": p.photo_s.url if (p and p.photo_s) else (p.photo.url if (p and p.photo) else None),
    }


def serialiser_message(m, cid=None):
    return {
        "id": m.pk,
        "auteur": m.auteur_id,
        "texte": m.texte,
        "cree_le": m.cree_le.isoformat(),
        "cid": cid,
    }


def conversation_entre(a, b):
    return Conversation.objects.filter(paire_cle=cle(a, b)).first()


def etat_discussion(moi, cible_id, profil, rel):
    """Etat de la relation de discussion entre moi et cible (pour le profil public)."""
    conv = conversation_entre(moi.pk, cible_id)
    if conv:
        return {"etat": "conversation", "conversation": conv.pk}
    inv = (InvitationDiscussion.objects
           .filter(statut="attente")
           .filter(Q(demandeur=moi, destinataire_id=cible_id) |
                   Q(demandeur_id=cible_id, destinataire=moi))
           .first())
    if inv:
        sens = "envoyee" if inv.demandeur_id == moi.pk else "recue"
        return {"etat": sens, "invitation": inv.pk}
    amis_ids = getattr(rel, "amis", set())
    ok = (profil.qui_peut_inviter == "tous" or
          (profil.qui_peut_inviter == "amis" and cible_id in amis_ids))
    return {"etat": "aucune" if ok else "indisponible"}


def inviter(moi, cible_id, message):
    from amis.services import relations
    message = (message or "").strip()[:200]
    if cible_id == moi.pk or cible_id in ids_bloques(moi):
        raise NotFound()
    profil = profils_actifs().filter(user_id=cible_id).first()
    if profil is None:
        raise NotFound()
    rel = relations(moi)
    amis_ids = getattr(rel, "amis", set())
    if (profil.qui_peut_inviter == "personne" or
            (profil.qui_peut_inviter == "amis" and cible_id not in amis_ids)):
        raise PermissionDenied("Cette personne n'accepte pas les invitations.")
    if conversation_entre(moi.pk, cible_id):
        raise ValidationError({"detail": "Vous pouvez deja discuter."})
    with transaction.atomic():
        # Invitation croisee : l'autre vous avait deja invite
        croisee = (InvitationDiscussion.objects
                   .select_for_update()
                   .filter(demandeur_id=cible_id, destinataire=moi, statut="attente")
                   .first())
        if croisee:
            return None, accepter(moi, croisee.pk)
        if InvitationDiscussion.objects.filter(
            demandeur=moi, destinataire_id=cible_id, statut="refusee",
            repondue_le__gt=timezone.now() - DELAI_REFUS,
        ).exists():
            raise ValidationError({"detail": "Vous pourrez renvoyer une invitation plus tard."})
        if InvitationDiscussion.objects.filter(demandeur=moi, statut="attente").count() >= MAX_EN_ATTENTE:
            raise ValidationError({"detail": "Trop d'invitations en attente."})
        try:
            inv = InvitationDiscussion.objects.create(
                demandeur=moi, destinataire_id=cible_id, message=message)
            evenement([cible_id], "invitation", moi)
        except IntegrityError:
            raise ValidationError({"detail": "Invitation deja envoyee."})
    transaction.on_commit(
        lambda: diffuser([cible_id], {"type": "invitation.nouvelle", "id": inv.pk}))
    return inv, None


def accepter(moi, pk):
    with transaction.atomic():
        inv = (InvitationDiscussion.objects
               .select_for_update()
               .filter(pk=pk, destinataire=moi, statut="attente")
               .first())
        if (inv is None or
                inv.demandeur_id in ids_bloques(moi) or
                not profils_actifs().filter(user_id=inv.demandeur_id).exists()):
            raise NotFound()
        inv.statut = "acceptee"
        inv.repondue_le = timezone.now()
        inv.save(update_fields=["statut", "repondue_le"])
        evenement([inv.demandeur_id], "invitation_acceptee", moi)
        conv, cree = Conversation.objects.get_or_create(paire_cle=cle(inv.demandeur_id, moi.pk))
        if cree:
            Participant.objects.bulk_create([
                Participant(conversation=conv, user_id=inv.demandeur_id),
                Participant(conversation=conv, user=moi),
            ])
        # Le message d'introduction devient le premier message
        if inv.message:
            m = Message.objects.create(
                conversation=conv, auteur_id=inv.demandeur_id, texte=inv.message)
            Conversation.objects.filter(pk=conv.pk).update(dernier_message_le=m.cree_le)
            Participant.objects.filter(
                conversation=conv, user_id=inv.demandeur_id).update(dernier_lu=m.pk)
    ids = [inv.demandeur_id, moi.pk]
    transaction.on_commit(
        lambda: diffuser(ids, {"type": "invitation.acceptee", "id": inv.pk, "conversation": conv.pk}))
    return conv


def contexte(user, conv_id):
    """Retourne (part, autres_ids) ou leve NotFound."""
    part = Participant.objects.filter(conversation_id=conv_id, user=user).first()
    if part is None:
        raise NotFound()
    autres = list(
        Participant.objects.filter(conversation_id=conv_id)
        .exclude(user=user)
        .values_list("user_id", flat=True))
    return part, autres


def verifier_ecriture(user, autres):
    if (set(autres) & ids_bloques(user) or
            profils_actifs().filter(user_id__in=autres).count() != len(autres)):
        raise PermissionDenied("Vous ne pouvez plus ecrire a cette personne.")


def autres_de(user, conv_id):
    """Pour le consumer WS : autres participants ou None si acces interdit."""
    if not Participant.objects.filter(conversation_id=conv_id, user=user).exists():
        return None
    autres = list(
        Participant.objects.filter(conversation_id=conv_id)
        .exclude(user=user)
        .values_list("user_id", flat=True))
    return None if set(autres) & ids_bloques(user) else autres


def envoyer_message(user, conv_id, texte, cid=None):
    texte = (texte or "").strip() if isinstance(texte, str) else ""
    if not texte:
        raise ValidationError({"texte": "Message vide."})
    if len(texte) > MAX_TEXTE:
        raise ValidationError({"texte": "Message trop long."})
    part, autres = contexte(user, conv_id)
    verifier_ecriture(user, autres)
    with transaction.atomic():
        m = Message.objects.create(conversation_id=conv_id, auteur=user, texte=texte)
        Conversation.objects.filter(pk=conv_id).update(dernier_message_le=m.cree_le)
        Participant.objects.filter(pk=part.pk).update(dernier_lu=m.pk)
    cid_propre = (cid or "")[:40] or None
    data = {
        "type": "message.nouveau",
        "conversation": conv_id,
        "message": serialiser_message(m, cid_propre),
    }
    transaction.on_commit(lambda: lancer(pousser_message, m.pk))
    return data, [user.pk, *autres]


def marquer_lu(user, conv_id, jusqua):
    part, autres = contexte(user, conv_id)
    dernier = Message.objects.filter(conversation_id=conv_id).aggregate(m=Max("id"))["m"] or 0
    jusqua = min(int(jusqua), dernier)
    n = Participant.objects.filter(pk=part.pk, dernier_lu__lt=jusqua).update(dernier_lu=jusqua)
    if not n:
        return None
    return {"type": "message.lu", "conversation": conv_id, "user": user.pk, "jusqua": jusqua}, [user.pk, *autres]
