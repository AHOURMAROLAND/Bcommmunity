# Cahier des charges : Bakhita Community
Réseau social des élèves et anciens élèves de l'école (version MVP)

## 1. Contexte et objectifs
L'école est un complexe allant de la maternelle au lycée (lycée moderne et lycée technique). L'application relie les **lycéens actuels** et les **anciens élèves**.
Objectifs :
- Retrouver ses camarades grâce au **parcours scolaire** (classes + années).
- Échanger en temps réel (chat direct).
- Publier des articles/images (blog ou journal) visibles par la communauté.
- Garder la mémoire et le réseau de l'école.

## 2. Rôles
| Rôle | Description |
|---|---|
| Visiteur | Non connecté : voit la page d'accueil, s'inscrit, se connecte |
| Élève actuel | Lycéen inscrit et validé |
| Ancien élève | Diplômé ou sorti, avec année de sortie et métier |
| Administrateur | Vous : valide les comptes, traite les signalements, suspend ou bannit un utilisateur, gère les référentiels (cycles, classes, filières). Il n'y a **pas de rôle modérateur séparé** |

## 3. Périmètre fonctionnel

### M1. Authentification et comptes
- Inscription (nom, prénom, e-mail, mot de passe, statut élève/ancien, année de sortie ou classe actuelle)
- Validation du compte par l'administration (anti faux profils)
- Connexion JWT (access + refresh), déconnexion, mot de passe oublié par e-mail
- Vérification de l'e-mail

### M2. Profil
- Photo, bio, statut, année de sortie (anciens), ville, liens
- **Situation actuelle (anciens élèves)** : tous ne travaillent pas, l'ancien choisit :
  - **Emploi** : intitulé du poste, entreprise, secteur, ville, depuis quand (option « indépendant / entrepreneur »)
  - **Études / Formation** : type (Université, école supérieure, formation professionnelle, autre). Si **Université** : université, faculté/UFR, **domaine** (liste), diplôme et niveau (Licence, Master, Doctorat), année de début et de fin prévue, ville/pays. Autres types : établissement, intitulé, domaine
  - **Recherche d'emploi / chômage** : ce qui est recherché (emploi, stage, formation), domaine souhaité (facultatif)
  - **Autre / ne pas préciser**
- Chaque information est facultative et son affichage se règle dans la confidentialité
- **Parcours scolaire** : lignes (cycle, classe, filière, année de début, année de fin)
  - Cycles : maternelle, primaire, collège, lycée moderne, lycée technique
  - La maternelle n'est qu'une donnée de parcours (pas de comptes d'enfants)
- Réglages de confidentialité : qui voit mon profil, mon parcours, qui peut m'écrire

### M3. Amis et suggestions
- Suggestions basées sur classes communes aux années qui se chevauchent
- Envoyer, annuler, accepter, refuser une demande ; retirer un ami
- Blocage d'un utilisateur
- Exclusion des suggestions : amis, demandes en attente, bloqués

### M4. Recherche / annuaire
- Recherche par nom
- Filtres : promotion, cycle, classe, filière, **situation (emploi / études / recherche), domaine, université, métier**

### M5. Publications (blog/journal)
- Créer : titre, texte (éditeur riche simple), image de couverture, brouillon/publié
- Modifier, supprimer ses publications
- Fil d'actualité (pagination infinie), page d'un article
- Likes et commentaires (modifier/supprimer les siens)
- Signalement d'une publication (voir M8)

### M6. Chat direct temps réel
- Conversation privée entre 2 utilisateurs, **uniquement après acceptation d'une invitation de discussion** (pas besoin d'être amis)
- **Invitation de discussion** : l'utilisateur envoie une demande (avec un court message d'introduction facultatif, 200 caractères max). Le destinataire peut **accepter** (la conversation s'ouvre) ou **refuser** (aucun message transmis). L'expéditeur peut **annuler** une demande en attente
- Anti-spam : 10 invitations en attente maximum par utilisateur, délai de 7 jours avant de réinviter quelqu'un qui a refusé, impossible d'inviter un utilisateur qui vous a bloqué
- Réglage de confidentialité : qui peut m'inviter (tout le monde / mes amis / personne)
- Une conversation peut être quittée ou archivée, et l'utilisateur peut bloquer
- WebSocket : envoi/réception instantanés, « en train d'écrire », « lu »
- Historique via API REST, pagination
- Groupes de discussion : **hors périmètre V1**, évolution prévue (le modèle `Conversation` a un champ `type` direct/groupe et des participants multiples)

### M7. Notifications
- Temps réel et liste : demande d'ami reçue/acceptée, **invitation de discussion reçue/acceptée/refusée**, like, commentaire, nouveau message, **nouvelle publication**
- **Nouvelle publication = notification pour tous les utilisateurs actifs** : envoyée quand une publication passe au statut « publié » (jamais pour un brouillon ni une publication masquée)
  - Envoi en tâche de fond (Celery) pour ne pas ralentir la publication
  - Exclusions : l'auteur, les suspendus, les utilisateurs bloqués par l'auteur ou l'ayant bloqué
  - Regroupement : si plusieurs publications arrivent, une seule notification « 5 nouvelles publications »
  - Le fil affiche aussi en direct un bandeau « Nouvelles publications » (WebSocket)
- Préférences : activer/désactiver chaque type, et pour les nouvelles publications choisir « immédiat », « résumé quotidien » ou « désactivé » (par défaut : immédiat)
- Marquer comme lu

### M8. Module de signalement et administration
**Signalement (côté utilisateur)**
- Bouton « Signaler » sur une **publication** et sur un **profil** (et depuis le chat)
- Motifs : harcèlement, contenu inapproprié, faux profil, spam, autre + commentaire facultatif
- Un utilisateur ne peut signaler qu'une fois la même cible

**Traitement (côté administrateur, dans le Django admin personnalisé : titre « Bakhita Community », thème moderne type Unfold ou Jazzmin)**
- Listes filtrables par type et statut, avec **actions en un clic** : « Masquer la publication », « Suspendre 24 h / 7 j / 30 j », « Bannir », « Ignorer »
- Seuls la modale « Signaler » et l'écran « Compte suspendu » sont dans l'application
- File des signalements (onglets Utilisateurs / Publications), statuts : nouveau, en cours, traité
- Publication : masquer, supprimer ou ignorer
- Utilisateur : avertir, **suspendre temporairement** (24 h, 7 j, 30 j ou date personnalisée, avec motif), **bannir définitivement** ou ignorer
- Effets d'une suspension : connexion refusée avec message « Compte suspendu jusqu'au… », sessions et WebSocket coupés, profil et publications masqués, e-mail envoyé
- Levée **automatique** à la date de fin, ou manuelle (lever / prolonger)
- Validation/refus des inscriptions
- Gestion des référentiels, statistiques de base

### M9. Partage de publications (opération de visibilité)
- Bouton « Partager » : partage natif du téléphone, avec « Copier le lien » en secours
- Le lien pointe vers `/p/{id}` : une page servie par Django avec les **balises Open Graph et Twitter** (titre, début du texte, image), car WhatsApp et Facebook ne lisent pas le JavaScript
- Protection des mineurs : le visiteur non connecté voit seulement un **aperçu** (titre, début, image) puis « Se connecter pour lire la suite »
- L'auteur peut décocher « Aperçu public » pour une publication précise

### M10. Installation et plateformes
- PWA : manifeste, icônes, service worker, bandeau d'aide iPhone (Partager, puis « Sur l'écran d'accueil »)
- APK Android via Capacitor, distribué par le Play Store (25 $ une fois) ou en direct
- Notifications push même application fermée (Web Push, FCM)
- Thème clair/sombre/automatique dans les paramètres

## 4. Exigences non fonctionnelles
- **Sécurité** : JWT, hash des mots de passe, CORS, limitation de débit, validation des uploads (type, taille ≤ 5 Mo)
- **Protection des mineurs/RGPD** : consentement, droit à l'effacement, export des données, chat uniquement après acceptation d'une invitation, accord de l'école
- **Performance** : fil < 1 s, message chat < 300 ms
- **Responsive** : mobile d'abord
- **Plateformes** : web, PWA installable (iPhone et Android) et APK Android (Capacitor), un seul code React
- **Thèmes** : clair (fond blanc, bleu marine) et sombre (couleurs inversées)
- **Accessibilité** : contrastes, navigation clavier
- **Langue** : français (i18n prévu)

## 5. Architecture technique
- Front : React (Vite), React Router, TanStack Query, Tailwind, `vite-plugin-pwa`
- Mobile : Capacitor (APK Android) ; PWA pour les iPhone (pas d'App Store)
- Push : Web Push (VAPID) pour la PWA, Firebase Cloud Messaging pour l'APK
- Admin : Django admin personnalisé (Unfold ou Jazzmin)
- Back : Django + Django REST Framework, SimpleJWT
- Temps réel : Django Channels + Redis
- Tâches de fond : Celery (notifications de masse, fin des suspensions, e-mails)
- BDD : PostgreSQL
- Fichiers : Cloudinary ou S3
- Déploiement : Docker, Nginx, **HTTPS obligatoire** (PWA et WebSocket sécurisé), CI GitHub Actions

## 6. Modèle de données
- **User**(email, nom, prénom, statut, validé, rôle)
- **Profil**(user, photo, bio, année_sortie, ville, confidentialité)
- **SituationActuelle**(profil, type[emploi|études|recherche|autre], visible, mis_à_jour)
  - détail emploi : poste, entreprise, secteur, ville, début, indépendant
  - détail études : type_formation, établissement, faculté, domaine, diplôme, niveau, début, fin_prévue, pays/ville
  - détail recherche : objectif[emploi|stage|formation], domaine
- **Domaine**(nom) : référentiel géré par l'admin (santé, droit, ingénierie, informatique, commerce…)
- **Cycle**(nom) · **Classe**(cycle, nom, filière?)
- **Scolarite**(profil, classe, année_début, année_fin)
- **Amitie**(demandeur, destinataire, statut, date)
- **Blocage**(bloqueur, bloqué)
- **Publication**(auteur, titre, contenu, image, statut, date, `apercu_public` booléen)
- **PushAbonnement**(user, type[webpush|fcm], jeton/endpoint, appareil, actif)
- **Commentaire**(publication, auteur, texte, date) · **Like**(publication, user)
- **InvitationDiscussion**(demandeur, destinataire, message_intro, statut[attente|acceptée|refusée|annulée], créée_le, répondue_le)
- **Conversation**(type[direct|groupe], participants M2M, créée_depuis_invitation) · **Message**(conversation, auteur, texte, date, lu)
- **Notification**(destinataire, type, objet, lu, date)
- **Signalement**(auteur, utilisateur_ciblé?, publication_ciblée?, motif, commentaire, statut, traité_le)
- **Suspension**(user, motif, début, fin?, définitive, active, créée_par, signalement?)

## 7. Endpoints principaux
| Domaine | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/password-reset` |
| Profil | `GET/PATCH /profils/me`, `GET /profils/{id}`, `CRUD /scolarites` |
| Amis | `GET /amis`, `GET /amis/suggestions`, `POST /amis/demandes`, `POST /amis/demandes/{id}/accepter`, `/refuser`, `DELETE /amis/{id}` |
| Recherche | `GET /profils?q=&promo=&classe=&filiere=` |
| Publications | `GET/POST /publications`, `GET/PATCH/DELETE /publications/{id}`, `POST /publications/{id}/like`, `CRUD /publications/{id}/commentaires` |
| Invitations de discussion | `POST /discussions/invitations`, `GET /discussions/invitations?type=recues|envoyees`, `POST /discussions/invitations/{id}/accepter`, `/refuser`, `DELETE /discussions/invitations/{id}` (annuler) |
| Chat | `GET /conversations`, `GET /conversations/{id}/messages`, WebSocket `ws/chat/?token=` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/lu`, `POST /notifications/lu-tout`, `GET/PATCH /notifications/preferences`, WebSocket `ws/notifs/` |
| Signalement | `POST /signalements` (cible = utilisateur ou publication) |
| Partage | `GET /p/{id}` : page HTML légère avec balises Open Graph, qui ouvre l'application |
| Push | `POST /push/web`, `POST /push/fcm`, `DELETE /push/{id}` |
| Admin | `GET /admin/signalements`, `PATCH /admin/signalements/{id}`, `POST /admin/publications/{id}/masquer`, `POST /admin/comptes/{id}/valider`, `POST /admin/utilisateurs/{id}/suspendre` (durée, motif), `POST /admin/utilisateurs/{id}/bannir`, `DELETE /admin/suspensions/{id}` |

## 8. Planning
Voir le fichier `04_plan_de_realisation_et_annexes.md` (phases, jalons, backlog MVP, risques).

## 9. Critères d'acceptation globaux
- Un nouvel utilisateur peut s'inscrire, être validé, remplir son parcours et voir des suggestions pertinentes
- Un utilisateur envoie une invitation de discussion ; une fois acceptée, les deux échangent en temps réel sans recharger la page ; si elle est refusée, aucune conversation n'est créée
- À chaque publication, tous les autres utilisateurs actifs reçoivent une notification, sauf s'ils l'ont désactivée
- Le lien partagé d'une publication affiche un aperçu (titre, début, image) dans WhatsApp ; un non-connecté ne voit que l'aperçu
- L'application s'installe sur Android (APK) et sur iPhone (PWA) et reçoit les notifications même fermée
- Une publication signalée peut être masquée par l'administrateur
- Un utilisateur signalé peut être suspendu pendant une durée choisie : il ne peut plus se connecter, puis retrouve son accès automatiquement à la fin
- Un utilisateur bloqué ne peut ni écrire ni voir le profil du bloqueur

## 10. Hors périmètre V1
Rôle modérateur séparé, groupes de discussion, appels audio/vidéo, événements, application iOS native sur l'App Store (remplacée par la PWA).

## 11. Identité visuelle (mise à jour)
- Police : Quicksand, installée en local (@fontsource/quicksand). Titres et "Bakhita" : 700. Texte courant et "Community" : 500 et 600.
- Le logo texte reprend cette police ; l'icône "B" avec cœur et toque reste l'icône d'application.
- Logos : emblème principal, version script, icône claire et icône sombre (dossier `logo/`)
- Palette claire : fond `#FFFFFF`, cartes `#F3F5FA`, texte et bouton principal `#0B1F4B` (bleu marine), bordures `#DDE3EF`
- Palette sombre (inverse) : fond `#0B1730`, cartes `#13244A`, texte et bouton principal `#FFFFFF`, bordures `#25396B`
- Couleurs fonctionnelles : bleu clair `#4F7FE0` (badges « en commun », liens), rouge doux (like, erreurs), vert (en ligne)
- Détails et variables CSS : annexe C du fichier 04

## 12. Périmètre MVP
1. Inscription, validation par l'admin, profil, parcours scolaire, situation actuelle
2. Annuaire, suggestions, amis
3. Publications, likes, commentaires, partage avec aperçu
4. Invitations de discussion et chat temps réel
5. Notifications dans l'application, puis push
6. Signalement et suspension via Django admin
7. PWA + APK Android

## 13. Exigences de qualité
Sécurité
- Mots de passe hachés avec Argon2, longueur minimale 10, validateurs Django actifs.
- JWT d'accès de 10 minutes en mémoire côté client ; jeton de rafraîchissement en cookie HttpOnly, Secure, SameSite, avec rotation et liste noire.
- Contrôle d'accès réseau à chaque requête : compte validé et non suspendu (mise en cache de 15 secondes).
- Limitation de débit par portée (inscription 5/heure, connexion 10/minute, utilisateurs 240/minute).
- Aucune donnée d'un autre utilisateur accessible par identifiant (filtrage systématique par propriétaire dans les querysets).
- HTTPS, HSTS, cookies sécurisés, CORS restreint, en-têtes de sécurité, URL d'admin non évidente, secrets uniquement par variables d'environnement.
- Uploads : type, taille et dimensions validés, recompression côté serveur (issue M3-02).
Performance
- Requêtes optimisées (select_related, prefetch_related, index sur les colonnes de jointure et de filtre), pagination partout.
- Référentiels et contrôle d'accès en cache Redis ; connexions base persistantes.
- Objectifs : réponse API p95 inférieure à 300 ms, message de chat inférieur à 300 ms.

## 14. Processus de développement
- Jalons et issues GitHub numérotés par code (M1-01, M1-02, ...), voir le plan.
- Branche main protégée : fusion uniquement par pull request avec CI verte (lint, tests, build).
- Fermeture automatique : un message de commit contenant "closes M1-06" ferme l'issue après réussite de la CI sur main ; un jalon sans issue ouverte est fermé automatiquement.

