# Bakhita Community : plan de réalisation et annexes

## 1. Principes
- **MVP d'abord** : on livre par jalons utilisables, une classe pilote teste avant l'ouverture à toute l'école.
- **Un seul code front** (React) pour le web, la PWA iPhone et l'APK Android.
- **Django admin** pour toute l'administration : pas d'espace admin à coder.
- Durées indicatives pour **1 à 2 développeurs** ; à ajuster selon votre disponibilité.

## 2. Phases et jalons
| Phase | Durée | Contenu | Livrable / critère de sortie |
|---|---|---|---|
| 0. Cadrage | 1 semaine | Valider les 6 maquettes (4 reçues + Invitations + Situation actuelle), nom, logo, textes légaux, accord de l'école | Maquettes validées, dépôt Git, environnements |
| 1. Fondations | 2 semaines | Projet Django + DRF, React + Tailwind, Docker, CI, thèmes clair/sombre, auth JWT, inscription, validation par l'admin, profil, parcours scolaire, situation actuelle | Un utilisateur s'inscrit, est validé et remplit son profil |
| 2. Réseau | 1,5 semaine | Annuaire et filtres, suggestions de camarades, amis, profil d'un autre | Suggestions « 3 classes en commun » correctes |
| 3. Publications | 2 semaines | CRUD publications, upload d'image, fil infini, likes, commentaires, page `/p/{id}` avec Open Graph, bouton Partager | Un article est publié, partagé sur WhatsApp avec aperçu |
| 4. Chat | 2 semaines | Invitations de discussion, Channels + Redis, messages, « écrit… », « lu », reconnexion | Deux utilisateurs échangent en direct après acceptation |
| 5. Notifications | 1,5 semaine | Notifications internes, nouvelle publication en masse (Celery), préférences, Web Push puis FCM | Notification reçue application fermée |
| 6. Sécurité et modération | 1 semaine | Signalement, suspensions (admin + tâche d'expiration), blocage, écran « Compte suspendu », personnalisation Django admin | Une suspension de 24 h se lève seule |
| 7. Mobile | 1 semaine | PWA (manifeste, service worker, bandeau iPhone), Capacitor, APK signé | Installation testée sur Android et iPhone |
| 8. Recette et pilote | 1,5 semaine | Tests de bout en bout, correctifs, classe pilote, déploiement HTTPS | Retours de la classe pilote traités |
| 9. Ouverture | 1 semaine | Import des anciens (CSV), communication, formation de l'administrateur | Ouverture à toute l'école |

**Total : environ 13 à 14 semaines** avec une seule personne ; 9 à 10 avec deux développeurs.

## 3. Ordre de développement conseillé (backlog MVP)
1. Auth + profil + scolarité (`V1-V4`, `E1`, `E2`, `A1`)
2. Admin : validation des comptes (`AD1`, `AD2`, `AD13`)
3. Annuaire, suggestions, amis (`E3-E6`, `E12`, `E13`, `A5`)
4. Publications, likes, commentaires (`E9-E11`)
5. Partage et aperçu (`E21`, `E22`, `V5`)
6. Invitations et chat (`E7-E7d`, `E26`, `E8`)
7. Notifications et push (`E14-E14b`, `E24`)
8. Signalement et suspension (`E15`, `E16`, `E19`, `AD3-AD8`)
9. PWA et APK (`E23`, `E25`)
10. Après MVP : confidentialité avancée, export/suppression, groupes, CSV, statistiques

## 4. Risques et parades
| Risque | Impact | Parade |
|---|---|---|
| Aperçu WhatsApp vide (SPA) | Partage inefficace | Page `/p/{id}` rendue côté Django avec balises Open Graph |
| Push iPhone limité | Notifications manquées | PWA installée obligatoire pour le push, bandeau d'aide ; FCM sur Android |
| WebSocket coupé en arrière-plan | Messages en retard | Reconnexion automatique, rattrapage par l'API REST, push |
| Faux profils | Confiance perdue | Validation manuelle par l'admin + import CSV des anciens |
| Mineurs exposés | Risque légal et moral | Aperçu public limité, invitations, blocage, signalement, accord de l'école, politique de confidentialité |
| Spam de notifications | Désinstallation | Regroupement, résumé quotidien, réglages |
| Dépendance à une personne | Projet bloqué | Documentation, dépôt Git, README, sauvegardes |
| Hébergement non HTTPS | PWA et push inopérants | Certificat Let's Encrypt dès l'environnement de test |

## 5. Hébergement et coûts à prévoir (à chiffrer)
- Serveur ou PaaS pour Django + PostgreSQL + Redis, stockage d'images, nom de domaine, e-mails transactionnels
- Google Play : 25 $ une seule fois ; Apple Developer (99 $ par an) **non nécessaire** grâce à la PWA
- Firebase (FCM) : gratuit pour ce volume

---

# Annexes

## A. Variables d'environnement
```
DJANGO_SECRET_KEY=
DJANGO_DEBUG=0
ALLOWED_HOSTS=bakhita.example
DATABASE_URL=postgres://...
REDIS_URL=redis://...
CORS_ALLOWED_ORIGINS=https://bakhita.example
CLOUDINARY_URL=   (ou AWS_S3_*)
EMAIL_HOST= / EMAIL_HOST_USER= / EMAIL_HOST_PASSWORD=
VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY= / VAPID_ADMIN_EMAIL=
FCM_SERVICE_ACCOUNT_JSON=
SITE_URL=https://bakhita.example
```

## B. Applications Django
| App | Contenu |
|---|---|
| `comptes` | User, authentification, validation, suspension |
| `profils` | Profil, SituationActuelle, Domaine |
| `scolarite` | Cycle, Classe, Scolarite, calcul des suggestions |
| `amis` | Amitie, Blocage |
| `publications` | Publication, Commentaire, Like, page `/p/{id}` |
| `discussions` | InvitationDiscussion, Conversation, Message, consumers Channels |
| `notifications` | Notification, préférences, PushAbonnement, tâches Celery |
| `signalements` | Signalement, Suspension, actions admin |

**Exemple d'actions admin pour les signalements**
```python
@admin.action(description="Suspendre 7 jours")
def suspendre_7j(modeladmin, request, queryset):
    for s in queryset.filter(utilisateur_cible__isnull=False):
        Suspension.objects.create(user=s.utilisateur_cible, motif=s.motif,
            debut=now(), fin=now() + timedelta(days=7), cree_par=request.user, signalement=s)
        s.statut = "traite"; s.save()

# Celery beat, toutes les 5 minutes
@shared_task
def lever_suspensions_expirees():
    Suspension.objects.filter(active=True, definitive=False, fin__lte=now()).update(active=False)
```
La connexion et le consumer WebSocket vérifient qu'aucune suspension active n'existe pour l'utilisateur.

**Requête de suggestions (principe)** : joindre `Scolarite` de l'utilisateur et des autres sur la même `classe` avec `annee_debut <= autre.annee_fin` et `annee_fin >= autre.annee_debut`, compter les classes communes, exclure amis, demandes en attente et bloqués, trier par ce nombre.

## C. Charte graphique (variables CSS)
```css
:root {
  --bg:#FFFFFF; --carte:#F3F5FA; --texte:#0B1F4B; --texte-doux:#5B6785;
  --bordure:#DDE3EF; --primaire:#0B1F4B; --sur-primaire:#FFFFFF;
  --accent:#4F7FE0; --danger:#E5484D; --en-ligne:#2BB673;
}
:root[data-theme="dark"] {
  --bg:#0B1730; --carte:#13244A; --texte:#FFFFFF; --texte-doux:#A9B6D6;
  --bordure:#25396B; --primaire:#FFFFFF; --sur-primaire:#0B1F4B;
}
```
Le thème « automatique » suit `prefers-color-scheme`. Contraste texte/fond marine-blanc d'environ 16:1.

**Police : Quicksand** (licence libre OFL), la plus proche de la police du logo
```bash
npm i @fontsource/quicksand
```
```js
import "@fontsource/quicksand/500.css"; import "@fontsource/quicksand/600.css"; import "@fontsource/quicksand/700.css";
```
```css
body { font-family: "Quicksand", system-ui, -apple-system, "Segoe UI", sans-serif; }
h1, h2, .titre { font-weight: 700; }   /* « Bakhita » */
.sous-titre { font-weight: 500; }      /* « Community » */
```
Installer la police en local (et non via Google Fonts) évite une requête externe pour chaque élève et fonctionne hors ligne dans la PWA et l'APK.

## D. Page de partage `/p/{id}` (balises Open Graph)
```html
<meta property="og:type" content="article">
<meta property="og:site_name" content="Bakhita Community">
<meta property="og:title" content="{{ publication.titre }}">
<meta property="og:description" content="{{ publication.extrait|truncatechars:160 }}">
<meta property="og:image" content="{{ image_absolue }}">   <!-- 1200x630 conseillé -->
<meta property="og:url" content="{{ SITE_URL }}/p/{{ publication.id }}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=/publications/{{ publication.id }}">
```
Si `apercu_public` est faux, la page affiche seulement le logo et « Publication réservée aux membres ». Les robots reçoivent la page sans redirection JavaScript.

## E. PWA
`manifest.webmanifest`
```json
{ "name": "Bakhita Community", "short_name": "Bakhita",
  "start_url": "/", "display": "standalone",
  "background_color": "#FFFFFF", "theme_color": "#0B1F4B",
  "icons": [ {"src":"/icons/192.png","sizes":"192x192","type":"image/png"},
             {"src":"/icons/512.png","sizes":"512x512","type":"image/png"},
             {"src":"/icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"} ] }
```
- Service worker : mise en cache de l'interface de base, page hors ligne, réception des push
- iPhone : balises `apple-touch-icon` et `apple-mobile-web-app-capable` ; installation par Partager puis « Sur l'écran d'accueil » ; le push n'y fonctionne qu'une fois installée
- Test : Lighthouse (score PWA), tests sur vrais appareils

## F. APK Android avec Capacitor
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications
npx cap init "Bakhita Community" com.bakhita.community --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android     # Android Studio : générer le bundle signé (AAB) ou l'APK
```
- Ajouter `google-services.json` (Firebase) dans `android/app`
- Garder la clé de signature en lieu sûr (sans elle, impossible de mettre à jour l'application)
- Publication : Play Console (25 $) ou APK partagé directement

## G. Notifications push
- **Web Push** : clés VAPID, `pywebpush` côté Django, abonnement enregistré par `POST /push/web`
- **FCM** (APK) : jeton enregistré par `POST /push/fcm`, envoi avec `firebase-admin`
- **Nouvelle publication** : tâche Celery qui crée les notifications par lots (par exemple 500), envoie le push aux abonnés actifs, saute auteur, suspendus et bloqués ; regroupe si plusieurs en quelques minutes
- Préférences par utilisateur : immédiat, résumé quotidien (tâche planifiée), désactivé

## H. Protocole WebSocket (JSON)
Connexion : `wss://.../ws/chat/?token=<JWT>` ; refus si compte suspendu.
| Sens | Événement | Contenu |
|---|---|---|
| client → serveur | `message.send` | `{conversation, texte}` |
| client → serveur | `typing` | `{conversation}` |
| client → serveur | `read` | `{conversation, jusqu_a_id}` |
| serveur → client | `message.new` | message complet |
| serveur → client | `typing` | `{conversation, user}` |
| serveur → client | `read` | `{conversation, jusqu_a_id}` |
| serveur → client | `invitation.new` / `invitation.accepted` | invitation |
| serveur → client | `notification.new` | notification |
| serveur → client | `publication.new` | alimente le bandeau « Nouvelles publications » |
Les messages sont enregistrés en base avant diffusion ; l'historique se charge par l'API REST.

## I. Écrans et maquettes
| Écran | État |
|---|---|
| Annuaire | Reçu ; ajouter badge de situation et filtres « Plus » |
| Fil | Reçu ; ajouter bouton Partager réel, bandeau « Nouvelles publications » |
| Profil d'un ancien | Reçu ; « Message » devient « Inviter à discuter », ajouter situation actuelle |
| Chat | Reçu ; retirer l'icône vidéo |
| Messages avec onglet **Invitations** (accepter/refuser) | À faire |
| Inscription + **Situation actuelle** (3 cartes) | À faire |
| Connexion, attente de validation, « Compte suspendu » | Simples, à faire |
| Créer une publication, page d'une publication | À faire |
| Modale « Signaler » | À faire |
| Paramètres (apparence, notifications, confidentialité, bloqués) | À faire |
| Notifications | À faire |

## J. Référentiels initiaux
- **Cycles** : maternelle, primaire, collège, lycée moderne, lycée technique
- **Classes** : à saisir selon l'école (par exemple petite/moyenne/grande section, CP à CM2, 6e à 3e, 2nde à Terminale)
- **Filières** : moderne (séries de l'école), technique (spécialités de l'école)
- **Domaines d'études** : santé et médecine, droit, ingénierie, informatique, commerce et gestion, lettres et langues, sciences, éducation, agriculture, arts, autre
- **Secteurs d'emploi** : liste similaire, modifiable dans l'admin
- **Motifs de signalement** : harcèlement, contenu inapproprié, faux profil, spam, autre

## K. Limites anti-abus
- 10 invitations de discussion en attente par utilisateur ; 7 jours avant de réinviter après un refus
- Limitation de débit sur l'inscription, la connexion, l'envoi de messages et les publications
- Images : 5 Mo maximum, types JPEG/PNG/WebP, recompression côté serveur
- Message d'introduction : 200 caractères

## L. Sécurité et conformité (liste de contrôle)
- Mots de passe hachés (Argon2 ou PBKDF2), JWT à courte durée, refresh en cookie sécurisé
- HTTPS partout, CORS restreint, en-têtes de sécurité, protection CSRF pour l'admin
- Validation de tous les uploads, nettoyage du HTML des publications (liste blanche)
- Admin Django protégé par authentification forte (2FA conseillé) et adresse non évidente
- Politique de confidentialité, conditions d'utilisation, consentement à l'inscription
- Droit d'accès, d'export et d'effacement ; accord écrit de l'école ; vérifier la réglementation locale sur les données des mineurs
- Sauvegardes quotidiennes de la base et des images, test de restauration

## M. Tests et déploiement
- Back : `pytest` (modèles, suggestions, permissions, suspensions, consumers WebSocket)
- Front : tests de composants, puis Playwright pour le scénario de bout en bout (fichier 03, section 19)
- CI : tests + lint à chaque envoi ; déploiement automatique sur un environnement de test
- Production : Docker Compose (Django/Daphne, Celery worker + beat, Redis, PostgreSQL, Nginx), journaux et alertes (Sentry)

## N. Glossaire
**PWA** : site installable comme une application. **APK** : fichier d'installation Android. **Capacitor** : outil qui met une application web dans un conteneur mobile. **Open Graph** : balises qui créent l'aperçu d'un lien. **VAPID** : clés d'identification du Web Push. **FCM** : service de notifications push de Google. **Celery** : exécution de tâches en arrière-plan.
