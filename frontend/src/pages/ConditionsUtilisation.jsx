import { Link } from "react-router-dom";
import PageLegale from "./PageLegale";
import { VERSION_APPLICATION } from "../utils/version";

export default function ConditionsUtilisation() {
  return (
    <PageLegale titre="Conditions d’utilisation">
      <p>
        Les présentes conditions encadrent l’accès à Bakhita Community, le réseau destiné aux élèves
        et anciens élèves de la communauté scolaire Bakhita. En créant un compte ou en utilisant
        l’application, vous vous engagez à les respecter ainsi que la politique de confidentialité.
      </p>

      <h2>1. Compte et accès</h2>
      <p>
        Fournissez des informations exactes, gardez vos moyens de connexion confidentiels et
        prévenez l’équipe si vous suspectez un accès non autorisé. Un compte est personnel. La
        connexion par Google est soumise aussi aux conditions de Google.
      </p>

      <h2>2. Respect de la communauté</h2>
      <p>
        Vous devez respecter les autres membres, les règles de l’établissement et la loi applicable.
        Il est interdit de harceler, menacer, usurper une identité, diffuser des contenus illicites,
        porter atteinte aux droits d’autrui, tenter de compromettre le service ou détourner ses
        fonctions.
      </p>

      <h2>3. Publications, messages et médias</h2>
      <p>
        Vous restez responsable des textes, images, fichiers et autres contenus que vous partagez.
        Ne publiez que des contenus que vous êtes autorisé à partager et respectez les choix de
        visibilité des profils. Les contenus visibles par d’autres membres peuvent être copiés ou
        enregistrés par leurs destinataires. Les messages privés ne sont pas présentés comme chiffrés
        de bout en bout.
      </p>
      <p>
        Vous conservez vos droits sur vos contenus. Vous autorisez l’application à les héberger,
        traiter et afficher dans la mesure nécessaire au fonctionnement des fonctions que vous
        utilisez, et selon les destinataires que vous choisissez.
      </p>

      <h2>4. Modération et disponibilité</h2>
      <p>
        L’équipe peut examiner les signalements, retirer ou limiter un contenu et restreindre un
        compte en cas de violation des présentes règles, pour protéger les membres ou assurer la
        sécurité du service. L’application peut évoluer, être temporairement indisponible ou voir
        certaines fonctions suspendues pour maintenance ou sécurité.
      </p>

      <h2>5. Notifications et services tiers</h2>
      <p>
        Vous pouvez modifier vos préférences de notification dans les paramètres de l’application
        et révoquer les autorisations push depuis votre appareil. Certaines fonctions utilisent des
        services tiers, notamment pour l’authentification Google, l’envoi d’e-mails et les
        notifications push; leurs propres conditions peuvent s’appliquer.
      </p>

      <h2>6. Suppression et évolution des conditions</h2>
      <p>
        Vous pouvez demander la suppression de votre compte depuis les paramètres ou consulter la
        <Link className="lien" to="/suppression-compte"> page de suppression du compte</Link>. Les
        conditions peuvent être actualisées; la version en vigueur est celle publiée dans
        l’application. Les demandes relatives aux présentes conditions peuvent être adressées à
        l’assistance.
      </p>
      <p className="doux">Version de l’application : {VERSION_APPLICATION}</p>
    </PageLegale>
  );
}
