import { Link } from "react-router-dom";
import PageLegale from "./PageLegale";
import { VERSION_APPLICATION } from "../utils/version";

export default function PolitiqueConfidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <p>
        Cette politique décrit les données traitées lorsque vous utilisez Bakhita Community. Le
        service est destiné aux élèves et anciens élèves de la communauté scolaire Bakhita. Les
        fonctions auxquelles vous accédez et les paramètres de confidentialité que vous choisissez
        déterminent les informations partagées avec les autres membres.
      </p>

      <h2>1. Données traitées</h2>
      <ul>
        <li>
          <strong>Compte et connexion :</strong> prénom, nom, adresse e-mail, statut d’élève ou
          d’ancien élève, mot de passe sous forme protégée, sessions de connexion et, si vous
          choisissez Google, identifiant de compte Google.
        </li>
        <li>
          <strong>Profil et parcours :</strong> photo, date d’anniversaire, biographie, ville,
          WhatsApp si vous le renseignez, parcours scolaire et situation d’études ou professionnelle.
        </li>
        <li>
          <strong>Activité sociale :</strong> publications, photos, commentaires, réactions, amis,
          invitations, messages et pièces jointes, ainsi que les signalements et échanges avec
          l’assistance que vous soumettez.
        </li>
        <li>
          <strong>Fonctionnement et sécurité :</strong> actions enregistrées dans le journal
          d’activité, adresse IP et informations d’appareil ou de navigateur associées à certaines
          actions, données techniques nécessaires aux sessions et à la synchronisation.
        </li>
        <li>
          <strong>Notifications :</strong> préférences de notification et identifiants techniques
          d’abonnement push lorsque vous activez les alertes sur un appareil.
        </li>
      </ul>

      <h2>2. Pourquoi ces données sont utilisées</h2>
      <p>
        Elles servent à créer et sécuriser votre compte, afficher le réseau et les profils selon vos
        réglages, fournir les fonctions de publications, d’amitié et de messagerie, envoyer les
        notifications demandées, répondre aux demandes d’assistance, prévenir les abus et maintenir
        le service. Elles ne sont pas vendues.
      </p>

      <h2>3. Visibilité et destinataires</h2>
      <p>
        Les membres peuvent voir les informations et contenus que vous rendez accessibles au moyen
        des réglages de visibilité du profil, du parcours, de la situation et du numéro WhatsApp.
        Les publications, commentaires et informations de compte sont également accessibles aux
        destinataires nécessaires à leur fonctionnement, ainsi qu’aux personnes habilitées à assurer
        la modération et la sécurité.
      </p>
      <p>
        Les prestataires techniques peuvent traiter des données pour fournir l’hébergement de
        l’application et de la base de données, le stockage des médias, l’envoi d’e-mails,
        l’authentification ou les notifications push. Le code prévoit notamment Google/Firebase,
        Brevo et OneSignal; l’infrastructure de production peut également utiliser Render, Vercel,
        Neon et Cloudflare selon sa configuration. Ces services peuvent traiter des données depuis
        les régions où ils opèrent et selon leurs propres politiques.
      </p>

      <h2>4. Conservation et sécurité</h2>
      <p>
        Les données de compte et les contenus sont conservés pour fournir le service, tant que le
        compte existe, sauf obligation ou nécessité légitime de conservation plus longue. Des
        informations techniques peuvent être conservées pour la sécurité et le diagnostic. Les
        durées opérationnelles et celles des sauvegardes dépendent de la configuration des services
        de production.
      </p>
      <p>
        Des mesures techniques et organisationnelles visent à protéger les comptes et les données.
        Aucun service en ligne ne peut toutefois garantir un risque nul. Les messages privés ne
        bénéficient pas d’un chiffrement de bout en bout annoncé par l’application.
      </p>

      <h2>5. Vos choix et vos droits</h2>
      <p>
        Vous pouvez modifier les informations et paramètres de visibilité de votre profil, régler
        les notifications et supprimer votre compte dans l’application. Selon la réglementation
        applicable, vous pouvez également demander l’accès, la rectification, l’effacement, la
        limitation ou l’opposition au traitement de vos données, et introduire une réclamation
        auprès de l’autorité compétente.
      </p>
      <p>
        Pour supprimer votre compte, consultez la <Link className="lien" to="/suppression-compte">page de suppression</Link>.
        Pour toute autre demande, contactez l’assistance intégrée à l’application.
      </p>

      <h2>6. Stockage local et technologies nécessaires</h2>
      <p>
        L’application utilise le stockage technique nécessaire à la connexion, aux préférences
        d’affichage et, lorsque la fonction hors ligne est utilisée, à la synchronisation temporaire
        de certaines données. Le navigateur ou l’appareil peut aussi conserver des données de
        session et des autorisations de notification. Les préférences de notifications push
        dépendent également des réglages de votre appareil.
      </p>

      <h2>7. Mises à jour</h2>
      <p>
        Cette politique peut évoluer pour refléter les changements du service ou des exigences
        applicables. La version publiée dans l’application fait foi. Version de l’application :
        {" "}{VERSION_APPLICATION}.
      </p>
    </PageLegale>
  );
}
