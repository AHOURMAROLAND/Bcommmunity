from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import NotFound

from comptes.models import User
from discussions.models import Message
from discussions.services import contexte
from notifications.services import lancer
from publications.models import Publication
from publications.views import visibles

from .models import Signalement
from .taches import alerter_admin


def creer_signalement(auteur, type_, cible_id, motif, commentaire):
    defauts = {"motif": motif, "commentaire": commentaire.strip()}
    if type_ == "utilisateur":
        cible = User.objects.filter(pk=cible_id, is_active=True).exclude(pk=auteur.pk).first()
        if cible is None:
            raise NotFound()
        filtre = {"utilisateur_cible_id": cible.pk}
        defauts["extrait"] = {"nom": f"{cible.prenom} {cible.nom}", "email": cible.email}
    elif type_ == "publication":
        pub = visibles(auteur).filter(pk=cible_id).exclude(auteur=auteur).first()
        if pub is None:
            raise NotFound()
        filtre = {"publication_cible_id": pub.pk}
        defauts["extrait"] = {"titre": pub.titre, "extrait": pub.extrait, "auteur": f"{pub.auteur.prenom} {pub.auteur.nom}"}
    else:
        _, autres = contexte(auteur, cible_id)  # 404 si l'auteur n'est pas dans la conversation
        if len(autres) != 1:
            raise NotFound()
        derniers = list(Message.objects.filter(conversation_id=cible_id).select_related("auteur").order_by("-id")[:30])
        filtre = {"conversation_cible_id": cible_id}
        defauts["utilisateur_cible_id"] = autres[0]
        defauts["extrait"] = {"messages": [
            {"id": m.pk, "auteur": f"{m.auteur.prenom} {m.auteur.nom}", "texte": m.texte, "date": m.cree_le.isoformat()}
            for m in reversed(derniers)]}
    with transaction.atomic():
        s, cree = Signalement.objects.get_or_create(auteur=auteur, type_cible=type_, **filtre, defaults=defauts)
        if cree:
            en_attente = Signalement.objects.filter(statut__in=["nouveau", "en_cours"]).count()
            if en_attente and en_attente % settings.SEUIL_ALERTES_ADMIN == 0:
                s.alerte_seuil = en_attente
                s.save(update_fields=["alerte_seuil"])
            seuil = settings.SEUIL_MASQUAGE_AUTO
            if type_ == "publication" and seuil and Signalement.objects.filter(
                    publication_cible_id=cible_id, statut__in=["nouveau", "en_cours"]).count() >= seuil:
                Publication.objects.filter(pk=cible_id, masquee=False).update(masquee=True)
            transaction.on_commit(lambda: lancer(alerter_admin, s.pk))
    return s, cree
