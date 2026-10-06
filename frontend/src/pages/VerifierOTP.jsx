import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, sauverRefresh, setAccessToken } from "../api/client";
import { Bouton, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";
import { estNatif } from "../utils/plateforme";

const NB_CHIFFRES = 6;
const COOLDOWN_S = 60;

export default function VerifierOTP() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const navigate = useNavigate();
  const location = useLocation();

  const [chiffres, setChiffres] = useState(Array(NB_CHIFFRES).fill(""));
  const [erreur, setErreur] = useState(location.state?.erreurEnvoi ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [cooldown, setCooldown] = useState(location.state?.codeEnvoye ? COOLDOWN_S : 0);
  const refs = useRef(Array.from({ length: NB_CHIFFRES }, () => null));

  // Focus first input on mount
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const soumettre = useCallback(
    async (code) => {
      if (envoi) return;
      setEnvoi(true);
      setErreur("");
      try {
        const data = await api("/auth/otp/verifier/", {
          method: "POST",
          body: { email, code },
        });
        // Store access token in memory; refresh cookie is set by the server for browser clients
        setAccessToken(data.access);
        if (estNatif() && data.refresh) {
          await sauverRefresh(data.refresh);
        }
        // Full navigation so AuthContext re-runs its mount effect with the new cookie/token
        window.location.replace("/fil");
      } catch (err) {
        if (err.status === 429) {
          setErreur("Trop de tentatives. Veuillez patienter avant de réessayer.");
        } else if (err.status === 403 && err.data?.code) {
          navigate("/en-attente", { replace: true, state: err.data });
        } else {
          setErreur(tousMessages(err) || "Code invalide ou expiré.");
        }
        // Clear all digits and refocus first input
        setChiffres(Array(NB_CHIFFRES).fill(""));
        setTimeout(() => refs.current[0]?.focus(), 0);
      } finally {
        setEnvoi(false);
      }
    },
    [email, envoi, navigate]
  );

  function onInput(index, e) {
    const val = e.target.value.replace(/\D/g, "").slice(-1);
    const suivant = [...chiffres];
    suivant[index] = val;
    setChiffres(suivant);
    if (val && index < NB_CHIFFRES - 1) {
      refs.current[index + 1]?.focus();
    }
    // Auto-submit when last digit is entered
    if (val && index === NB_CHIFFRES - 1) {
      const code = suivant.join("");
      if (code.length === NB_CHIFFRES) {
        soumettre(code);
      }
    }
  }

  function onKeyDown(index, e) {
    if (e.key === "Backspace" && !chiffres[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function onPaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, NB_CHIFFRES);
    if (!text) return;
    const suivant = Array(NB_CHIFFRES).fill("");
    text.split("").forEach((c, i) => { suivant[i] = c; });
    setChiffres(suivant);
    const nextFocus = Math.min(text.length, NB_CHIFFRES - 1);
    refs.current[nextFocus]?.focus();
    if (text.length === NB_CHIFFRES) {
      soumettre(text);
    }
  }

  async function renvoyer() {
    if (cooldown > 0) return;
    try {
      await api("/auth/otp/envoyer/", { method: "POST", body: { email } });
      setErreur("");
      setCooldown(COOLDOWN_S);
    } catch (err) {
      setErreur(tousMessages(err) || "Le code n'a pas pu être envoyé. Réessayez.");
    }
  }

  return (
    <main className="page">
      <div className="boite">
        <Marque sous="Vérifiez votre adresse e-mail." />
        <div className="carte">
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Code de vérification</h1>
          <p className="doux" style={{ marginBottom: "1.5rem" }}>
            Un code à 6 chiffres a été envoyé à{" "}
            <strong style={{ wordBreak: "break-all" }}>{email || "votre adresse e-mail"}</strong>.
            Il est valable 10 minutes.
          </p>

          {/* 6 individual digit inputs */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              marginBottom: "1.5rem",
            }}
            role="group"
            aria-label="Code de vérification à 6 chiffres"
          >
            {chiffres.map((val, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={val}
                onChange={(e) => onInput(i, e)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={i === 0 ? onPaste : undefined}
                aria-label={`Chiffre ${i + 1}`}
                style={{
                  width: "3rem",
                  height: "3.5rem",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  textAlign: "center",
                  border: "2px solid var(--bordure, #ddd)",
                  borderRadius: "0.5rem",
                  background: "var(--carte, #fff)",
                  color: "var(--texte, #111)",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--accent, #e87c1e)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--bordure, #ddd)"; }}
                autoComplete="one-time-code"
                disabled={envoi}
              />
            ))}
          </div>

          {erreur && (
            <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>
              {erreur}
            </p>
          )}

          <Bouton
            type="button"
            chargement={envoi}
            onClick={() => {
              const code = chiffres.join("");
              if (code.length === NB_CHIFFRES) soumettre(code);
            }}
            disabled={chiffres.join("").length < NB_CHIFFRES || envoi}
            style={{ width: "100%", marginBottom: "1rem" }}
          >
            Vérifier
          </Bouton>

          {/* Resend button with 60s cooldown */}
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              className="lien"
              onClick={renvoyer}
              disabled={cooldown > 0}
              style={{
                background: "none",
                border: "none",
                cursor: cooldown > 0 ? "default" : "pointer",
                opacity: cooldown > 0 ? 0.5 : 1,
                fontSize: "0.9rem",
              }}
            >
              {cooldown > 0
                ? `Renvoyer le code (${cooldown}s)`
                : "Renvoyer le code"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
