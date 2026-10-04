"""
Brevo SMTP transactional email wrapper.

In development (BREVO_SMTP_LOGIN not set), falls back to Django's configured
EMAIL_BACKEND (console by default), so no real emails are sent.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.conf import settings

logger = logging.getLogger(__name__)


def send_smtp(to: str, subject: str, html: str) -> None:
    """Send a transactional HTML email via Brevo SMTP or fall back to Django's email backend."""
    login = getattr(settings, "BREVO_SMTP_LOGIN", "") or ""
    password = getattr(settings, "BREVO_SMTP_PASSWORD", "") or ""

    if not login:
        # Dev fallback: use Django's mail backend (console in dev)
        from django.core.mail import send_mail
        # Strip basic HTML tags for plain-text fallback
        import re
        plain = re.sub(r"<[^>]+>", "", html).strip()
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [to], html_message=html,
                  fail_silently=False)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.DEFAULT_FROM_EMAIL
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP("smtp-relay.brevo.com", 587) as server:
        server.ehlo()
        server.starttls()
        server.login(login, password)
        server.sendmail(settings.DEFAULT_FROM_EMAIL, [to], msg.as_string())


def envoyer_otp(email: str, prenom: str, code: str) -> None:
    """Send the 6-digit OTP verification email."""
    subject = "Votre code de vérification — Bakhita Community"
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>{subject}</title></head>
<body style="font-family:sans-serif;background:#f4f4f4;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:2rem 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:0.75rem;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#e87c1e;padding:1.5rem;text-align:center;">
            <span style="color:#fff;font-size:1.4rem;font-weight:700;">Bakhita Community</span>
          </td>
        </tr>
        <tr>
          <td style="padding:2rem;">
            <p style="margin:0 0 1rem;">Bonjour <strong>{prenom}</strong>,</p>
            <p style="margin:0 0 1.5rem;">
              Voici votre code de vérification. Il est valable <strong>10 minutes</strong>.
            </p>
            <div style="text-align:center;margin:1.5rem 0;">
              <span style="display:inline-block;font-size:2.5rem;font-weight:800;
                           letter-spacing:0.4rem;color:#e87c1e;background:#fff7f0;
                           border:2px solid #e87c1e;border-radius:0.5rem;
                           padding:0.6rem 1.5rem;">{code}</span>
            </div>
            <p style="margin:1.5rem 0 0;color:#666;font-size:0.875rem;">
              Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:1rem 2rem;background:#f9f9f9;text-align:center;
                     color:#999;font-size:0.75rem;">
            © Bakhita Community — Tous droits réservés
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    try:
        send_smtp(email, subject, html)
    except Exception:
        logger.exception("Échec d'envoi du code OTP à %s", email)


def envoyer_reinitialisation(email: str, prenom: str, lien: str) -> None:
    """Send the password reset link email."""
    subject = "Réinitialisation de votre mot de passe — Bakhita Community"
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>{subject}</title></head>
<body style="font-family:sans-serif;background:#f4f4f4;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:2rem 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:0.75rem;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#e87c1e;padding:1.5rem;text-align:center;">
            <span style="color:#fff;font-size:1.4rem;font-weight:700;">Bakhita Community</span>
          </td>
        </tr>
        <tr>
          <td style="padding:2rem;">
            <p style="margin:0 0 1rem;">Bonjour <strong>{prenom}</strong>,</p>
            <p style="margin:0 0 1.5rem;">
              Vous avez demandé à réinitialiser votre mot de passe.
              Cliquez sur le bouton ci-dessous (lien valable <strong>1 heure</strong>) :
            </p>
            <div style="text-align:center;margin:1.5rem 0;">
              <a href="{lien}"
                 style="display:inline-block;background:#e87c1e;color:#fff;
                        text-decoration:none;padding:0.75rem 2rem;border-radius:0.4rem;
                        font-weight:700;font-size:1rem;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="margin:1.5rem 0 0;color:#666;font-size:0.875rem;">
              Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:1rem 2rem;background:#f9f9f9;text-align:center;
                     color:#999;font-size:0.75rem;">
            © Bakhita Community — Tous droits réservés
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    try:
        send_smtp(email, subject, html)
    except Exception:
        logger.exception("Échec d'envoi du lien de réinitialisation à %s", email)
