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

from .models import (
    Conversation,
    InvitationDiscussion,
    Message,
    MessageFavori,
    MessageMasque,
    Participant,
    ReactionMessage,
)

logger = logging.getLogger(__name__)
DELAI_REFUS = timedelta(days=7)
MAX_EN_ATTENTE = 10
MAX_TEXTE = 2000
DELAI_MODIFICATION = timedelta(minutes=15)


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


def serialiser_reactions(message, user_id):
    comptes = {}
    for reaction in message.reactions.all():
        compte = comptes.setdefault(reaction.emoji, {"emoji": reaction.emoji, "nb": 0, "moi": False})
        compte["nb"] += 1
        compte["moi"] |= reaction.user_id == user_id
    return sorted(comptes.values(), key=lambda reaction: (-reaction["nb"], reaction["emoji"]))


def serialiser_message(m, cid=None, user_id=None):
    reponse = None
    if m.en_reponse_a_id:
        reponse = {
            "id": m.en_reponse_a_id,
            "texte": (m.en_reponse_a.texte or "")[:80],
            "auteur_id": m.en_reponse_a.auteur_id,
        }
    supprime = m.supprime_pour_tous
    favoris = getattr(m, "_favoris_moi", None)
    favori = bool(favoris) if favoris is not None else (
        MessageFavori.objects.filter(message=m, user_id=user_id).exists()
        if user_id is not None else False
    )
    return {
        "id": m.pk,
        "auteur": m.auteur_id,
        "texte": "" if supprime else m.texte,
        "type": m.type,
        "fichier_url": m.fichier.url if m.fichier and not supprime else None,
        "nom_fichier": "" if supprime else m.nom_fichier,
        "taille_fichier": None if supprime else m.taille_fichier,
        "duree_vocale": None if supprime else m.duree_vocale,
        "forme_onde": [] if supprime else (m.forme_onde or []),
        "en_reponse_a": reponse,
        "reactions": (
            serialiser_reactions(m, user_id)
            if user_id is not None and not supprime else []
        ),
        "modifie_le": m.modifie_le.isoformat() if m.modifie_le else None,
        "transfere": m.transfere,
        "message_origine_id": m.message_origine_id,
        "supprime_pour_tous": supprime,
        "epingle": m.epingle,
        "favori": favori,
        "cree_le": m.cree_le.isoformat(),
        "cid": cid or m.client_id or None,
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


def envoyer_message(user, conv_id, texte="", cid=None, type="texte", fichier=None,
                   nom_fichier="", taille_fichier=None, duree_vocale=None,
                   forme_onde=None, en_reponse_a_id=None):
    if type not in Message.Type.values:
        raise ValidationError({"type": "Type de message invalide."})
    texte = (texte or "").strip() if isinstance(texte, str) else ""
    if type == "texte" and not texte:
        raise ValidationError({"texte": "Message vide."})
    if type == "texte" and len(texte) > MAX_TEXTE:
        raise ValidationError({"texte": "Message trop long."})
    if type != "texte" and fichier is None:
        raise ValidationError({"fichier": "Un fichier est obligatoire pour ce message."})
    if texte and len(texte) > MAX_TEXTE:
        raise ValidationError({"texte": "Message trop long."})
    part, autres = contexte(user, conv_id)
    verifier_ecriture(user, autres)
    cid_propre = (cid or "")[:40]
    if cid_propre:
        existant = (Message.objects
                    .filter(conversation_id=conv_id, auteur=user, client_id=cid_propre)
                    .select_related("en_reponse_a")
                    .prefetch_related("reactions")
                    .first())
        if existant:
            return {
                "type": "message.nouveau",
                "conversation": conv_id,
                "message": serialiser_message(existant, cid_propre, user.pk),
            }, [user.pk, *autres]
    if en_reponse_a_id not in (None, ""):
        try:
            en_reponse_a_id = int(en_reponse_a_id)
        except (TypeError, ValueError):
            raise ValidationError({"en_reponse_a_id": "Message cité invalide."})
        if en_reponse_a_id < 1 or not Message.objects.filter(
            pk=en_reponse_a_id, conversation_id=conv_id
        ).exists():
            raise ValidationError({"en_reponse_a_id": "Message cité invalide."})
    else:
        en_reponse_a_id = None
    with transaction.atomic():
        m = Message.objects.create(
            conversation_id=conv_id,
            auteur=user,
            texte=texte,
            type=type,
            fichier=fichier,
            nom_fichier=nom_fichier or "",
            taille_fichier=taille_fichier,
            duree_vocale=duree_vocale,
            forme_onde=forme_onde or [],
            client_id=cid_propre,
            en_reponse_a_id=en_reponse_a_id,
        )
        Conversation.objects.filter(pk=conv_id).update(dernier_message_le=m.cree_le)
        Participant.objects.filter(pk=part.pk).update(dernier_lu=m.pk)
    data = {
        "type": "message.nouveau",
        "conversation": conv_id,
        "message": serialiser_message(m, cid_propre or None, user.pk),
    }
    transaction.on_commit(lambda: lancer(pousser_message, m.pk))
    return data, [user.pk, *autres]


def _message_action(user, conv_id, msg_id):
    _, autres = contexte(user, conv_id)
    if set(autres) & ids_bloques(user):
        raise NotFound()
    message = (
        Message.objects.filter(pk=msg_id, conversation_id=conv_id)
        .exclude(masques__user=user)
        .first()
    )
    if message is None:
        raise NotFound()
    return message, autres


def modifier_message(user, conv_id, msg_id, texte):
    message, autres = _message_action(user, conv_id, msg_id)
    if not isinstance(texte, str):
        raise ValidationError({"texte": "Texte invalide."})
    texte = texte.strip()
    if message.type == Message.Type.TEXTE and not texte:
        raise ValidationError({"texte": "Message vide."})
    if len(texte) > MAX_TEXTE:
        raise ValidationError({"texte": "Message trop long."})
    with transaction.atomic():
        message = Message.objects.select_for_update().get(pk=message.pk)
        if message.auteur_id != user.pk:
            raise PermissionDenied("Vous ne pouvez modifier que vos propres messages.")
        if message.supprime_pour_tous:
            raise NotFound()
        maintenant = timezone.now()
        if maintenant > message.cree_le + DELAI_MODIFICATION:
            raise ValidationError({"detail": "Le délai de modification de 15 minutes est dépassé."})
        message.texte = texte
        message.modifie_le = maintenant
        message.save(update_fields=["texte", "modifie_le"])
        data = {
            "type": "message.modifie",
            "conversation": conv_id,
            "message": serialiser_message(message, user_id=user.pk),
        }
    return data, [user.pk, *autres]


def supprimer_message(user, conv_id, msg_id, pour_tous=False):
    message, autres = _message_action(user, conv_id, msg_id)
    with transaction.atomic():
        message = Message.objects.select_for_update().get(pk=message.pk)
        if message.supprime_pour_tous:
            raise NotFound()
        if pour_tous:
            if message.auteur_id != user.pk:
                raise PermissionDenied("Vous ne pouvez supprimer que vos propres messages pour tous.")
            message.texte = ""
            message.fichier = ""
            message.nom_fichier = ""
            message.taille_fichier = None
            message.duree_vocale = None
            message.forme_onde = []
            message.supprime_pour_tous = True
            message.epingle = False
            message.save(update_fields=[
                "texte", "fichier", "nom_fichier", "taille_fichier",
                "duree_vocale", "forme_onde", "supprime_pour_tous", "epingle",
            ])
            ReactionMessage.objects.filter(message=message).delete()
            event = {
                "type": "message.supprime_pour_tous",
                "conversation": conv_id,
                "message": serialiser_message(message, user_id=user.pk),
            }
            ids = [user.pk, *autres]
        else:
            MessageMasque.objects.get_or_create(message=message, user=user)
            event = None
            ids = [user.pk]
    return event, ids


def definir_favori(user, conv_id, msg_id, actif):
    message, _ = _message_action(user, conv_id, msg_id)
    if message.supprime_pour_tous:
        raise NotFound()
    if actif:
        _, created = MessageFavori.objects.get_or_create(message=message, user=user)
        return {"favori": True, "created": created}
    MessageFavori.objects.filter(message=message, user=user).delete()
    return {"favori": False, "created": False}


def definir_epingle(user, conv_id, msg_id, actif):
    message, autres = _message_action(user, conv_id, msg_id)
    with transaction.atomic():
        Conversation.objects.select_for_update().get(pk=conv_id)
        message = Message.objects.select_for_update().get(pk=message.pk)
        if message.supprime_pour_tous:
            raise NotFound()
        if actif:
            Message.objects.filter(
                conversation_id=conv_id, epingle=True,
            ).exclude(pk=message.pk).update(epingle=False)
        Message.objects.filter(pk=message.pk).update(epingle=actif)
    return {
        "type": "message.epingle",
        "conversation": conv_id,
        "message_id": message.pk,
        "epingle": actif,
    }, [user.pk, *autres]


def transferer_message(user, conv_id, msg_id, destination_id, client_id=None):
    source, _ = _message_action(user, conv_id, msg_id)
    multiple = isinstance(destination_id, list)
    destinations_brutes = destination_id if multiple else [destination_id]
    if not destinations_brutes or len(destinations_brutes) > 5:
        raise ValidationError({"conversations": "Choisissez entre 1 et 5 conversations."})
    destinations = []
    for valeur in destinations_brutes:
        if isinstance(valeur, bool):
            raise ValidationError({"conversations": "Conversation invalide."})
        try:
            valeur = int(valeur)
        except (TypeError, ValueError):
            raise ValidationError({"conversations": "Conversation invalide."})
        if valeur not in destinations:
            destinations.append(valeur)
    if len(destinations) != len(destinations_brutes):
        raise ValidationError({"conversations": "Une conversation ne peut être choisie deux fois."})
    if conv_id in destinations:
        raise ValidationError({"conversations": "Choisissez une autre conversation."})
    if client_id is not None and (
        not isinstance(client_id, str)
        or not 1 <= len(client_id) <= 40
        or not client_id.replace("-", "").isalnum()
    ):
        raise ValidationError({"cid": "Identifiant de transfert invalide."})
    destinataires = {}
    for destination in destinations:
        _, autres = contexte(user, destination)
        verifier_ecriture(user, autres)
        destinataires[destination] = autres

    evenements = []
    with transaction.atomic():
        source = Message.objects.select_for_update().get(pk=source.pk)
        if source.supprime_pour_tous:
            raise NotFound()
        anciens = {}
        if client_id:
            anciens = {
                message.conversation_id: message
                for message in Message.objects.filter(
                    auteur=user,
                    conversation_id__in=destinations,
                    client_id=client_id,
                )
            }
        messages = []
        for destination in destinations:
            transfert = anciens.get(destination)
            if transfert is None:
                transfert = Message.objects.create(
                    conversation_id=destination,
                    auteur=user,
                    texte=source.texte,
                    type=source.type,
                    fichier=source.fichier.name if source.fichier else "",
                    nom_fichier=source.nom_fichier,
                    taille_fichier=source.taille_fichier,
                    duree_vocale=source.duree_vocale,
                    forme_onde=source.forme_onde or [],
                    client_id=client_id or "",
                    transfere=True,
                    message_origine=source,
                )
                Conversation.objects.filter(pk=destination).update(
                    dernier_message_le=transfert.cree_le,
                )
                Participant.objects.filter(
                    conversation_id=destination, user=user,
                ).update(dernier_lu=transfert.pk)
                transaction.on_commit(
                    lambda message_id=transfert.pk: lancer(pousser_message, message_id)
                )
            messages.append(serialiser_message(transfert, user_id=user.pk))
            evenements.append((
                {"type": "message.nouveau", "conversation": destination, "message": messages[-1]},
                [user.pk, *destinataires[destination]],
            ))
    if multiple:
        return {"messages": messages, "transfere": True, "_evenements": evenements}, [user.pk]
    return evenements[0][0], evenements[0][1]


def marquer_lu(user, conv_id, jusqua):
    part, autres = contexte(user, conv_id)
    dernier = Message.objects.filter(conversation_id=conv_id).aggregate(m=Max("id"))["m"] or 0
    jusqua = min(int(jusqua), dernier)
    n = Participant.objects.filter(pk=part.pk, dernier_lu__lt=jusqua).update(dernier_lu=jusqua)
    if not n:
        return None
    return {"type": "message.lu", "conversation": conv_id, "user": user.pk, "jusqua": jusqua}, [user.pk, *autres]
