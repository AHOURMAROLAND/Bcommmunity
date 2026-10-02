# Bakhita Community : user stories par type d'utilisateur

Format : **En tant que** [rôle], **je veux** [action], **afin de** [bénéfice]. Priorité : P1 (V1 indispensable), P2 (important), P3 (plus tard).

## Visiteur
| ID | Story | Critères d'acceptation | Prio |
|---|---|---|---|
| V1 | Voir la page d'accueil pour comprendre le réseau | Présentation + boutons S'inscrire / Se connecter | P1 |
| V2 | Créer un compte pour rejoindre | Formulaire validé, e-mail de confirmation, message « en attente de validation » | P1 |
| V3 | Me connecter | Succès → fil ; échec → message d'erreur clair | P1 |
| V4 | Réinitialiser mon mot de passe | Lien par e-mail valable 1 h | P1 |
| V5 | Voir l'aperçu d'une publication partagée sur WhatsApp | Titre, début, image, bouton « Se connecter pour lire la suite » | P1 |

## Élève actuel
| ID | Story | Critères d'acceptation | Prio |
|---|---|---|---|
| E1 | Compléter mon profil (photo, bio) | Sauvegarde et aperçu | P1 |
| E2 | Ajouter mon parcours scolaire (cycle, classe, années) | Plusieurs lignes, modifiables, supprimables | P1 |
| E3 | Voir des suggestions d'amis selon mes classes | Liste triée par nombre de classes communes | P1 |
| E4 | Envoyer une demande d'ami | Statut « en attente », notification au destinataire | P1 |
| E5 | Accepter ou refuser une demande reçue | L'ami apparaît dans ma liste | P1 |
| E6 | Retirer un ami | Confirmation puis suppression | P1 |
| E7 | Envoyer une invitation de discussion à un utilisateur (avec message d'introduction facultatif) | Statut « en attente », notification au destinataire | P1 |
| E7a | Accepter ou refuser une invitation reçue | Acceptée → conversation créée ; refusée → rien n'est transmis | P1 |
| E7b | Annuler une invitation envoyée | Invitation retirée | P1 |
| E7c | Chatter en direct une fois l'invitation acceptée | Message reçu sans rechargement | P1 |
| E7d | Choisir qui peut m'inviter (tout le monde / amis / personne) | Réglage respecté | P1 |
| E8 | Voir « en train d'écrire » et « lu » | Indicateurs visibles | P2 |
| E9 | Publier un article avec texte et image | Apparaît dans le fil | P1 |
| E10 | Modifier ou supprimer ma publication | Seulement l'auteur | P1 |
| E11 | Liker et commenter une publication | Compteurs mis à jour | P1 |
| E12 | Consulter le profil d'un autre utilisateur | Selon ses réglages de confidentialité | P1 |
| E13 | Rechercher par nom ou filtres | Résultats paginés | P1 |
| E14 | Recevoir des notifications | Cloche avec compteur, liste | P1 |
| E14a | Être notifié à chaque nouvelle publication sur l'application | Notification « X a publié … », clic → publication | P1 |
| E14b | Régler les notifications de publications (immédiat / résumé quotidien / désactivé) | Réglage respecté, activé par défaut | P1 |
| E14c | Voir « 5 nouvelles publications » regroupées | Une seule notification groupée | P2 |
| E15 | Signaler une publication ou un utilisateur | Choix du motif + commentaire facultatif, une seule fois par cible, confirmation | P1 |
| E16 | Bloquer un utilisateur | Plus de messages ni de visibilité | P1 |
| E17 | Régler ma confidentialité | Qui peut m'écrire, voir mon parcours | P2 |
| E18 | Supprimer mon compte et exporter mes données | Suppression effective après confirmation | P2 |
| E19 | Être informé si mon compte est suspendu | Message avec motif et date de fin à la connexion, e-mail | P1 |
| E20 | Créer un groupe de discussion | **Évolution future**, hors V1 | P3 |
| E21 | Partager une publication | Menu de partage du téléphone ou « Copier le lien » | P1 |
| E22 | Choisir si l'aperçu de ma publication est public | Case « Aperçu public », activée par défaut | P2 |
| E23 | Installer l'application (Android APK, iPhone PWA) | Bandeau d'aide, icône sur l'écran d'accueil | P1 |
| E24 | Recevoir des notifications push application fermée | Autorisation demandée, réglable dans les paramètres | P1 |
| E25 | Choisir le thème clair, sombre ou automatique | Mémorisé sur l'appareil | P2 |
| E26 | Voir et gérer mes invitations de discussion dans un onglet dédié | Onglet « Invitations » avec badge, boutons Accepter / Refuser | P1 |

## Ancien élève
Il a toutes les stories de l'élève actuel, plus :
| ID | Story | Critères d'acceptation | Prio |
|---|---|---|---|
| A1 | Indiquer ma situation actuelle : emploi, études/formation, recherche d'emploi ou autre | Choix unique, modifiable à tout moment, badge sur le profil | P1 |
| A1a | Si **emploi** : renseigner poste, entreprise, secteur, ville | Affichés sur le profil | P1 |
| A1b | Si **études/formation** : choisir le type, et pour l'université indiquer université, faculté, domaine, diplôme/niveau, années | Affichés sur le profil, domaine cliquable | P1 |
| A1c | Si **recherche d'emploi** : préciser ce que je cherche (emploi, stage, formation) et le domaine | Badge « En recherche » sans jugement | P2 |
| A1d | Choisir qui voit ma situation actuelle | Réglage de confidentialité respecté | P1 |
| A5 | Retrouver des anciens par domaine d'études ou université | Filtres domaine, université, situation dans l'annuaire | P1 |
| A6 | Voir sur le profil d'un ancien son domaine pour demander un conseil d'orientation | Bouton « Envoyer un message » | P2 |
| A2 | Retrouver mes anciens camarades de promotion | Filtre par promotion et classe | P1 |
| A3 | Partager mon expérience professionnelle dans un article | Étiquette « Ancien » sur la publication | P2 |
| A4 | Être contacté par des élèves actuels pour conseils | Option « disponible pour échanger » | P3 |

## Administrateur (vous, seul gestionnaire, sans modérateur, via le Django admin personnalisé)
| ID | Story | Critères d'acceptation | Prio |
|---|---|---|---|
| AD1 | Voir la liste des inscriptions en attente | Détails + Valider / Refuser | P1 |
| AD2 | Valider ou refuser un compte | E-mail envoyé à l'utilisateur | P1 |
| AD3 | Voir la file des signalements, séparés en Utilisateurs et Publications | Filtre par statut, nombre de signalements par cible, motifs | P1 |
| AD4 | Masquer, supprimer ou ignorer une publication signalée | Contenu invisible, auteur notifié | P1 |
| AD5 | **Suspendre un utilisateur pour une durée choisie** (24 h, 7 j, 30 j, personnalisée) | Connexion refusée, sessions et chat coupés, profil masqué, e-mail avec motif | P1 |
| AD6 | Bannir définitivement un utilisateur | Accès bloqué sans date de fin | P1 |
| AD7 | Voir la liste des suspendus et lever ou prolonger une suspension | Date de fin visible, levée manuelle possible | P1 |
| AD8 | Que la suspension se termine automatiquement | À l'échéance, l'accès est rétabli sans action | P1 |
| AD9 | Avertir un utilisateur sans le suspendre | Notification + e-mail | P2 |
| AD10 | Gérer cycles, classes, filières | CRUD dans l'admin | P1 |
| AD11 | Voir des statistiques (inscrits, publications, signalements) | Tableau de bord simple | P3 |
| AD12 | Importer une liste d'anciens élèves (CSV) pour pré-valider | Import avec rapport d'erreurs | P3 |
| AD13 | Personnaliser le Django admin (titre « Bakhita Community », thème, libellés en français) | Interface lisible, actions en un clic | P1 |
| AD14 | Gérer les référentiels (domaines, motifs de signalement, classes) sans coder | CRUD dans l'admin | P1 |

## Découpage MVP
- **Jalon 1** : V1-V4, E1, E2, AD1, AD2, A1-A1d
- **Jalon 2** : E3-E6, E12, E13, A2, A5
- **Jalon 3** : E9-E11, E21, V5, E22
- **Jalon 4** : E7-E7d, E26, E8
- **Jalon 5** : E14-E14b, E24, E23, E25
- **Jalon 6** : E15, E16, E19, AD3-AD8, AD13, AD14
- **Après le MVP** : E17, E18, E20, E14c, AD9, AD11, AD12, A3, A4, A6
