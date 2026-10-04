import { LogIn } from "lucide-react";

export default function GoogleNatif({ onCredential }) {
  async function cliquer() {
    try {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      if (r.credential?.idToken) onCredential(r.credential.idToken);
    } catch { /* l'utilisateur a fermé la fenêtre Google */ }
  }
  return <button type="button" className="btn btn-sec" onClick={cliquer}><LogIn size={18} /> Continuer avec Google</button>;
}
