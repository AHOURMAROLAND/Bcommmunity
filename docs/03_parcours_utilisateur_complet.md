# Bakhita Community : parcours utilisateur complet, page par page, bouton par bouton

Lecture : chaque tableau liste les éléments cliquables d'une page, ce qui se passe, et l'appel technique correspondant.

## Plan de navigation
```
Accueil ─► Inscription ─► Attente validation ─► Onboarding (profil + parcours) ─► Fil
        └► Connexion ─► (Mot de passe oublié) ─► Fil
Fil ─► Publication ─► Profil auteur
 ├► Créer publication
 ├► Annuaire / Recherche ─► Profil
 ├► Amis (suggestions · demandes · liste)
 ├► Messages (liste · conversation)
 ├► Notifications
 ├► Mon profil ─► Édition ─► Paramètres
 └► Espace administrateur (compte admin uniquement)
```

## 0. Lien partagé et installation de l'application
| Élément | Action | Résultat |
|---|---|---|
| Lien reçu sur WhatsApp `/p/{id}` | clic | Page d'aperçu : logo, titre, début du texte, image |
| Bouton « Se connecter pour lire la suite » | clic | → `/connexion`, puis retour à la publication |
| Bouton « Créer un compte » (aperçu) | clic | → `/inscription` |
| Bandeau « Installer Bakhita Community » (Android/Chrome) | clic | Invite d'installation PWA |
| Bandeau iPhone « Appuyez sur Partager, puis Sur l'écran d'accueil » | clic sur « Compris » | Bandeau masqué (rappel après 7 jours) |
| APK Android | installation | Même application dans un conteneur Capacitor, écran de démarrage |
| Première ouverture connectée | | Demande « Autoriser les notifications ? » (Autoriser / Plus tard) |

## 1. Page d'accueil `/`
| Élément | Action | Résultat |
|---|---|---|
| Bouton « S'inscrire » | clic | → `/inscription` |
| Bouton « Se connecter » | clic | → `/connexion` |
| Lien « Mentions légales / Confidentialité » | clic | → pages statiques |

## 2. Inscription `/inscription`
| Élément | Action | Résultat |
|---|---|---|
| Champs nom, prénom, e-mail, mot de passe, confirmation | saisie | Validation en direct (format, force) |
| Choix « Élève actuel » / « Ancien élève » | sélection | Affiche classe actuelle ou année de sortie |
| Case « J'accepte les conditions » | cocher | Obligatoire pour activer le bouton |
| Bouton « Créer mon compte » | clic | `POST /auth/register` → page « Vérifiez votre e-mail » ; erreur → message sous le champ |
| Lien « J'ai déjà un compte » | clic | → `/connexion` |

## 3. Vérification e-mail
| Élément | Action | Résultat |
|---|---|---|
| Code à 6 chiffres reçu par e-mail | saisie | E-mail vérifié, compte activé et connexion ouverte |
| Bouton « Renvoyer le code » | clic | Nouveau code envoyé, le précédent est invalidé |
| Retour puis connexion avec un compte non vérifié | clic | Renvoi vers la vérification e-mail avec un nouveau code |
La validation manuelle par l'école n'est pas requise. Une adresse e-mail doit toutefois être vérifiée avant une connexion par mot de passe.

## 4. Connexion `/connexion`
| Élément | Action | Résultat |
|---|---|---|
| E-mail + mot de passe | saisie | |
| Bouton « Se connecter » | clic | `POST /auth/connexion/` → tokens → `/fil` (ou `/onboarding` si profil incomplet) ; e-mail non vérifié → code OTP ; compte suspendu/banni → `/en-attente` |
| Lien « Mot de passe oublié ? » | clic | → `/mot-de-passe-oublie` |
| Compte suspendu | connexion | Écran « Compte suspendu jusqu'au JJ/MM/AAAA » avec motif, aucun accès ; si bannissement : message « Accès retiré » |

## 5. Mot de passe oublié
| Élément | Action | Résultat |
|---|---|---|
| Champ e-mail + « Envoyer le lien » | clic | E-mail avec lien (1 h) ; message neutre même si l'e-mail est inconnu |
| Page de réinitialisation : nouveau mot de passe + « Valider » | clic | Mot de passe changé → `/connexion` |

## 6. Onboarding `/onboarding` (3 étapes)
| Étape | Éléments | Résultat |
|---|---|---|
| 1. Identité | Upload photo, bio, ville, bouton « Suivant » | `PATCH /profils/me` |
| 2. Parcours scolaire | Bouton « + Ajouter une classe » ; liste déroulante cycle → classe (→ filière si lycée) ; année début / fin ; « Enregistrer la ligne » ; icônes ✏️ et 🗑️ par ligne ; « Suivant » | `POST /scolarites` ; ligne ajoutée à la liste |
| 3. Situation actuelle (anciens seulement) | Année de sortie ; 4 cartes cliquables : « J'ai un emploi », « Je suis en études / formation », « Je cherche un emploi », « Autre / je préfère ne pas dire » ; « Terminer » | Affiche le formulaire de la carte choisie (ci-dessous) ; `PATCH /profils/me/situation` puis → `/amis/suggestions` avec message « Voici des personnes de votre parcours » |
| 3a. Carte « Emploi » | Poste, entreprise, secteur (liste), ville, depuis (année), case « Indépendant / entrepreneur » | Champs obligatoires : poste |
| 3b. Carte « Études / formation » | Liste « Type » : Université / École supérieure / Formation professionnelle / Autre | Si **Université** : université, faculté/UFR, **domaine** (liste), diplôme (Licence, Master, Doctorat…), niveau, année de début, année de fin prévue, ville/pays. Autre type : établissement, intitulé, domaine |
| 3c. Carte « Recherche » | Cases : emploi / stage / formation ; domaine souhaité (facultatif) | Badge « En recherche » |
| 3d. Confidentialité | Liste « Qui voit ma situation » : tout le monde / amis / personne | Sauvegardé |
| Lien « Passer » | clic | Étape suivante, rappel dans le profil |

## 7. Fil d'actualité `/fil`
**Barre de navigation (toutes les pages connectées)** : Logo (→ fil), champ recherche (→ annuaire), icône Amis (badge demandes), icône Messages (badge non lus), 🔔 Notifications (badge), avatar (menu : Mon profil, Paramètres, Déconnexion).

| Élément | Action | Résultat |
|---|---|---|
| Bouton « ✍️ Écrire une publication » | clic | → `/publier` |
| Carte publication : titre ou « Lire la suite » | clic | → `/publications/{id}` |
| Nom/avatar de l'auteur | clic | → `/profil/{id}` |
| ❤️ Like | clic | Toggle like, compteur ±1 (`POST /publications/{id}/like`) |
| ↗ Partager | clic | Menu de partage du téléphone (WhatsApp, etc.) avec le lien `/p/{id}` ; sinon « Lien copié » |
| 💬 Commentaires | clic | Ouvre l'article, focus sur zone de commentaire |
| Menu ⋯ → « Signaler la publication » | clic | Modale motif + commentaire → `POST /signalements` → toast « Merci, l'administrateur va examiner » |
| Menu ⋯ → « Modifier » / « Supprimer » (auteur) | clic | Édition / confirmation puis suppression |
| Bandeau « 3 nouvelles publications » (temps réel) | clic | Recharge le haut du fil |
| Défilement bas de page | scroll | Chargement de la page suivante |
| Fil vide | | Bouton « Trouver des camarades » → suggestions |

## 8. Créer / modifier une publication `/publier`
| Élément | Action | Résultat |
|---|---|---|
| Titre, éditeur de texte (gras, titres, listes, lien) | saisie | |
| Bouton « Ajouter une image » | clic | Sélecteur fichier, aperçu ; > 5 Mo ou mauvais type → erreur |
| Bouton « ✖ » sur l'aperçu | clic | Retire l'image |
| Case « Aperçu public pour les non-connectés » (cochée par défaut) | cocher | Le lien partagé montre ou non l'aperçu |
| Bouton « Enregistrer en brouillon » | clic | Statut brouillon, visible dans « Mes publications » |
| Bouton « Publier » | clic | `POST /publications` → `/publications/{id}` |
| Bouton « Annuler » | clic | Confirmation si modifications → `/fil` |

## 9. Page d'une publication `/publications/{id}`
| Élément | Action | Résultat |
|---|---|---|
| Image, titre, texte, auteur, date | lecture | |
| ❤️ Like | clic | Toggle |
| ↗ Partager | clic | Partage natif ou copie du lien |
| Zone commentaire + « Envoyer » | clic | `POST …/commentaires`, ajout en haut ou bas de liste, notification à l'auteur |
| Sur son commentaire : « Modifier » / « Supprimer » | clic | Édition inline / confirmation |
| Bouton « ← Retour » | clic | Retour au fil |

## 10. Annuaire et recherche `/annuaire`
| Élément | Action | Résultat |
|---|---|---|
| Champ de recherche | saisie | Résultats avec debounce |
| Filtres : promotion, cycle, classe, filière, situation (emploi / études / recherche), domaine, université, métier | sélection | `GET /profils?...` |
| Filtre « Domaine » (ex. médecine) puis « Université » | sélection en cascade | Liste des anciens concernés |
| Bouton « Réinitialiser » | clic | Efface les filtres |
| Carte profil : « Voir le profil » | clic | → `/profil/{id}` |
| Carte profil : « Ajouter » | clic | Demande envoyée, bouton devient « En attente » |
| Aucun résultat | | Message + suggestion d'élargir |

## 11. Profil d'un autre utilisateur `/profil/{id}`
| Élément | Action | Résultat |
|---|---|---|
| En-tête : photo, nom, statut, badge de situation (Emploi / Études / En recherche) | lecture | Selon confidentialité |
| Section « Situation actuelle » | lecture | Emploi : poste + entreprise ; Études : université, faculté, domaine, diplôme, années ; Recherche : ce qui est cherché. Le **domaine** est cliquable → annuaire filtré |
| Section « Parcours scolaire » | lecture | Lignes + badge « en commun avec vous » |
| Bouton « Ajouter en ami » | clic | → « Demande envoyée » ; si reçue : « Accepter » / « Refuser » ; si amis : « ✓ Amis » |
| Bouton « Annuler la demande » | clic | Retire la demande |
| Bouton « Inviter à discuter » | clic | Modale : message d'introduction facultatif (200 car.) + « Envoyer l'invitation » → `POST /discussions/invitations`, le bouton devient « Invitation envoyée » |
| Bouton « Invitation envoyée » | clic | Option « Annuler l'invitation » |
| Bouton « Répondre à l'invitation » (si le profil m'a invité) | clic | « Accepter » / « Refuser » |
| Bouton « Envoyer un message » (invitation déjà acceptée) | clic | Ouvre `/messages/{conversationId}` |
| Bouton grisé « Messages désactivés » | | Si la personne n'accepte aucune invitation, ou après un refus (délai de 7 jours) |
| Menu ⋯ → « Retirer des amis » | clic | Confirmation puis suppression |
| Menu ⋯ → « Bloquer » | clic | Confirmation, plus d'interactions |
| Menu ⋯ → « Signaler cet utilisateur » | clic | Modale motif + commentaire → signalement enregistré |
| Onglet « Publications » | clic | Ses articles publiés |
| Onglet « Amis communs » | clic | Liste |

## 12. Amis `/amis`
| Onglet | Éléments | Résultat |
|---|---|---|
| Suggestions | Carte : « 3 classes en commun : 6e, 5e, 2nde Moderne » ; « Ajouter » ; « Ignorer » | Demande envoyée / carte masquée |
| Demandes reçues | « Accepter » / « Refuser » | Ami ajouté + notification / demande supprimée |
| Demandes envoyées | « Annuler » | Demande retirée |
| Mes amis | Champ « Filtrer » ; « Inviter à discuter » (ou « Message » si la conversation existe) ; « Voir le profil » ; ⋯ → « Retirer » | Selon l'action |
| Filtre par classe commune | liste déroulante | Réduit les suggestions |

## 13. Messages (chat) `/messages` et `/messages/{id}`
| Élément | Action | Résultat |
|---|---|---|
| Liste des conversations (avatar, dernier message, badge non lu) | clic | Ouvre la conversation |
| Onglet « Invitations » (badge) | clic | Sous-onglets « Reçues » / « Envoyées » |
| Invitation reçue : nom, message d'intro, « Accepter » / « Refuser » | clic | Accepter → conversation créée et ouverte, l'expéditeur est notifié ; Refuser → invitation fermée, aucun message transmis |
| Invitation envoyée : « Annuler » | clic | Invitation retirée |
| Bouton « Nouvelle invitation » | clic | Recherche d'un utilisateur → modale d'invitation |
| Aucune conversation | | Message « Invitez quelqu'un à discuter » + bouton vers l'annuaire |
| Zone de saisie | frappe | Envoie « typing » via WebSocket, l'autre voit « écrit… » |
| Bouton « Envoyer » ou Entrée | clic | Message envoyé par WebSocket, stocké en base, affiché instantanément ✓ |
| Réception d'un message | automatique | Apparaît sans recharger, badge si ailleurs, notification |
| Ouverture de la conversation | automatique | Messages marqués « lus » (✓✓) |
| Défilement vers le haut | scroll | Charge l'historique plus ancien |
| En-tête : nom cliquable | clic | → profil |
| Menu ⋯ → « Bloquer » / « Signaler » | clic | Modale / confirmation |
| Perte de connexion | automatique | Bandeau « Reconnexion… », reconnexion automatique, renvoi des messages en attente |

## 14. Notifications `/notifications`
| Élément | Action | Résultat |
|---|---|---|
| 🔔 dans la barre | clic | Liste déroulante des 5 dernières |
| Notification (« X a aimé votre publication ») | clic | → objet concerné, marquée lue |
| Notification « X a publié : [titre] » (nouvelle publication) | clic | → `/publications/{id}` |
| Notification groupée « 5 nouvelles publications » | clic | → `/fil` |
| Notification « X vous invite à discuter » | clic | → `/messages` onglet Invitations |
| « Tout marquer comme lu » | clic | Badge à 0 |
| « Voir tout » | clic | Page complète paginée |

## 15. Mon profil `/profil/moi`
| Élément | Action | Résultat |
|---|---|---|
| Bouton « Modifier le profil » | clic | → `/profil/modifier` |
| Section parcours : « + Ajouter », ✏️, 🗑️ | clic | Même formulaire que l'onboarding |
| Section « Situation actuelle » : « Modifier » | clic | Même formulaire que l'onboarding étape 3, changement de carte possible (ex. passage d'études à emploi) |
| Onglet « Mes publications » | clic | Publiées + brouillons, avec Modifier / Supprimer |
| Onglet « Mes amis » | clic | → `/amis` |

## 16. Paramètres `/parametres`
| Section | Éléments | Résultat |
|---|---|---|
| Compte | Changer e-mail, changer mot de passe | Confirmation par e-mail |
| Confidentialité | Qui voit mon profil / mon parcours ; qui peut m'inviter à discuter (tout le monde / amis / personne) | `PATCH /profils/me` |
| Notifications | Activer/désactiver par type ; pour « Nouvelles publications » : Immédiat / Résumé quotidien / Désactivé (défaut : immédiat) | Sauvegarde |
| Utilisateurs bloqués | Liste + « Débloquer » | Débloqué |
| Apparence | Clair / Sombre / Automatique | Thème appliqué et mémorisé |
| Application | « Installer l'application » ; « Activer les notifications push » | Invite d'installation ; enregistrement `POST /push/web` ou `/push/fcm` |
| Données | « Exporter mes données » ; « Supprimer mon compte » (confirmation par mot de passe) | Fichier JSON ; compte supprimé → accueil |

## 17. Espace administrateur : Django admin personnalisé `/admin/`
Pas de modérateur : l'administrateur traite tout dans Django admin (titre « Bakhita Community », en français).
| Section admin | Éléments | Résultat |
|---|---|---|
| Accueil | Raccourcis : signalements nouveaux, inscriptions en attente, suspendus | Liens filtrés |
| Utilisateurs | Liste, recherche, filtre « Non validés » ; actions « Valider », « Refuser », « Suspendre 24 h / 7 j / 30 j », « Bannir », « Réactiver » | E-mail envoyé, statut mis à jour |
| Signalements | Filtres : type (utilisateur / publication), statut (nouveau, en cours, traité), motif ; colonnes : cible, motif, nombre de signalements, date | Clic → détail |
| Actions signalement : publication | « Masquer la publication », « Supprimer », « Ignorer » | Auteur notifié, signalement → traité |
| Actions signalement : utilisateur | « Avertir », « Suspendre 24 h / 7 j / 30 j », « Bannir », « Ignorer » | Suspension créée avec motif, sessions coupées |
| Suspensions | Liste avec date de fin, filtre « Actives » ; actions « Lever », « Prolonger » | Accès rétabli / date modifiée |
| Publications | Recherche, filtre « Masquées », action « Masquer / Réafficher » | |
| Référentiels | Cycles, classes, filières, domaines, motifs de signalement | CRUD |
| Tâche planifiée | Celery beat, toutes les 5 minutes | Lève automatiquement les suspensions échues |

**Dans l'application** : la modale « Signaler » (motif + commentaire) et l'écran « Compte suspendu jusqu'au… » restent côté utilisateur.

## 18. États et erreurs à prévoir sur chaque page
- Chargement (squelettes), liste vide, erreur réseau (bouton « Réessayer »)
- Session expirée : refresh automatique, sinon → `/connexion`
- Compte suspendu en cours de session : déconnexion immédiate, écran de suspension
- Accès refusé (403) et page introuvable (404)
- Toasts de confirmation après chaque action

## 19. Scénario de test de bout en bout
1. Visiteur → s'inscrit → valide l'e-mail → attend
2. L'administrateur valide le compte
3. Utilisateur se connecte → onboarding → ajoute 4 lignes de parcours
4. Voit les suggestions → envoie 2 demandes
5. L'autre accepte → notification reçue
6. Invitation à discuter envoyée → acceptée par l'autre → ouverture du chat → échange en temps réel avec « en train d'écrire » et « lu » (test aussi du refus et de l'annulation)
7. Publication d'un article avec image → tous les autres utilisateurs reçoivent « X a publié » → like et commentaire par l'ami
8. Signalement d'une publication → masquée par l'administrateur ; signalement d'un utilisateur → suspension de 7 jours : connexion refusée avec la date de fin, chat coupé, puis accès rétabli automatiquement à l'échéance
9. Blocage puis déblocage d'un utilisateur
10. Export des données puis suppression du compte
11. Partage d'une publication sur WhatsApp : l'aperçu s'affiche, un non-connecté ne lit que l'aperçu
12. Installation sur Android (APK) et sur iPhone (PWA), réception d'une notification de publication application fermée
