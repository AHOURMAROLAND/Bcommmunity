# Implementation Plan — Bakhita Community Lots A & B

This plan covers two independent feature lots. FEAT-001 (LOT A — OTP/Brevo) and FEAT-002 (LOT B — Enriched messages) are implemented sequentially to avoid migration conflicts. Each FEAT leaves the codebase in a buildable, test-passing state.

---

## FEAT-001 — LOT A: OTP email via Brevo + signup redirect

**Design decisions:**
- OTP codes are stored hashed (Django `make_password`/`check_password`) — same approach as passwords, avoids exposing codes in the DB.
- Brevo integration uses SMTP (smtp-relay.brevo.com:587) instead of the Brevo REST API — no new library required, uses Django's built-in `smtplib` path.
- The Brevo SMTP block in settings.py is conditional on `BREVO_SMTP_LOGIN` being set — so in dev the existing `console.EmailBackend` remains active.
- `EnvoyerOTPView` returns HTTP 200 regardless of whether the email exists (same pattern as `OubliView`) to prevent user enumeration.
- The `/verifier-email` frontend route is public (wrapped in `<Invite>` guard like `/inscription`) — a logged-in user doesn't need to verify from this page.

---

- [ ] 1. **Create `backend/comptes/brevo.py`** — Brevo SMTP transactional wrapper.
      Three functions: `send_smtp(to, subject, html)` builds a MIME email and sends via `smtplib.SMTP` on port 587 using `BREVO_SMTP_LOGIN`/`BREVO_SMTP_PASSWORD` from `settings`. Fallback: if `BREVO_SMTP_LOGIN` is falsy, calls `django.core.mail.send_mail` (uses whatever `EMAIL_BACKEND` is configured — console in dev). `envoyer_otp(email, prenom, code)` sends a styled HTML email with the 6-digit code valid 10 min. `envoyer_reinitialisation(email, prenom, lien)` sends the password reset HTML email.
      Files: `backend/comptes/brevo.py` (create)
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 2. **Add `OTPEmail` model to `backend/comptes/models.py`**.
      Fields: `user` (FK `User` CASCADE, `related_name="otps"`), `code` (CharField max_length=128 — hashed), `expire_le` (DateTimeField), `utilise` (BooleanField default=False). Meta indexes on `["user", "utilise", "expire_le"]`. Import `make_password`/`check_password` from `django.contrib.auth.hashers`.
      Files: `backend/comptes/models.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 3. **Create migration for `OTPEmail`**.
      Run `cd backend && .venv\Scripts\python.exe manage.py makemigrations comptes`. The output file is `backend/comptes/migrations/0003_otpemail.py`. Confirm it uses only SQLite-compatible field types.
      Files: `backend/comptes/migrations/0003_otpemail.py` (generated)
      Verify: `cd backend && .venv\Scripts\python.exe manage.py migrate` — applies cleanly.

- [ ] 4. **Add `EnvoyerOTPView` and `VerifierOTPView` to `backend/comptes/views.py`**.
      `EnvoyerOTPView` (POST `/api/auth/otp/envoyer/`): `AllowAny`, `throttle_scope="otp_envoyer"`. Look up `User` by email (case-insensitive, `is_active=True`). Generate `str(secrets.randbelow(1_000_000)).zfill(6)`. Expire (mark `utilise=True`) all previous unexpired OTPs for this user. Create `OTPEmail(user=user, code=make_password(plain), expire_le=now()+timedelta(minutes=10))`. Call `brevo.envoyer_otp(user.email, user.prenom, plain)`. Return 200 with generic message regardless.
      `VerifierOTPView` (POST `/api/auth/otp/verifier/`): `AllowAny`, `throttle_scope="otp_verifier"`. Accept `{email, code}`. Find user. Find latest `OTPEmail` where `utilise=False` and `expire_le > now()`. `check_password(code, otp.code)`. On success: `otp.utilise=True` + `user.email_verifie=True` + save, call `verifier_acces(user)`, return `reponse_connexion(user)`. On failure: return 400 with `{"detail": "Code invalide ou expiré."}`.
      Files: `backend/comptes/views.py`
      Verify: `cd backend && .venv\Scripts\pytest.exe` — all existing tests pass.

- [ ] 5. **Add OTP throttle scopes and Brevo SMTP block to `backend/config/settings.py`**.
      Add `"otp_envoyer": "3/hour"` and `"otp_verifier": "10/hour"` to `DEFAULT_THROTTLE_RATES`. After the existing `EMAIL_BACKEND` lines, add a conditional block: `if env("BREVO_SMTP_LOGIN"):` → override `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_BACKEND` to use Brevo SMTP. In dev without the env var, nothing changes.
      Files: `backend/config/settings.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 6. **Register OTP routes in `backend/comptes/urls.py`**.
      Add `path("auth/otp/envoyer/", views.EnvoyerOTPView.as_view())` and `path("auth/otp/verifier/", views.VerifierOTPView.as_view())`.
      Files: `backend/comptes/urls.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 7. **Switch `OubliView` to use `brevo.envoyer_reinitialisation`**.
      In `backend/comptes/views.py`, inside `envoyer_lien_reinitialisation()`, replace the `send_mail(...)` call with `from .brevo import envoyer_reinitialisation` and call `envoyer_reinitialisation(user.email, user.prenom, lien)`. Keep the existing `try/except` + `logger.exception` wrapper.
      Files: `backend/comptes/views.py`
      Verify: `cd backend && .venv\Scripts\pytest.exe` — `tests_acces.py::test_oubli_adresse_inconnue_meme_reponse_sans_mail` and `test_reinitialisation_complete_et_lien_a_usage_unique` still pass.

- [ ] 8. **Add Brevo env vars to `.env`**.
      Append three blank-value lines: `BREVO_SMTP_LOGIN=`, `BREVO_SMTP_PASSWORD=`, `BREVO_API_KEY=`.
      Files: `.env`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues (blank values keep dev in console-email mode).

- [ ] 9. **Create `frontend/src/pages/VerifierOTP.jsx`**.
      Reads `?email=` query param via `useSearchParams()`. Shows a title "Vérifiez votre adresse e-mail" and instructions. Six `<input maxLength={1}>` fields with refs array for auto-focus-next behavior on input and Backspace-to-prev on keydown. Assembles the 6-digit string. On complete (all 6 digits entered): auto-submit `POST /api/auth/otp/verifier/` via `api()`. On 200: call `connexion` from `AuthContext` (or store tokens if AuthContext exposes that), navigate to `/fil`. On error: show error message. "Renvoyer le code" button: calls `POST /api/auth/otp/envoyer/` with `{email}`, disabled for 60s after click (countdown via `useEffect`).
      Files: `frontend/src/pages/VerifierOTP.jsx` (create)
      Verify: `cd frontend && npm run build` — builds without errors.

- [ ] 10. **Modify `frontend/src/pages/Inscription.jsx` signup redirect**.
      In the `soumettre` success branch, replace the `setTermine(true)` call with `navigate(\`/verifier-email?email=\${encodeURIComponent(f.email.trim())}\`)`. Keep the `termine` state and rendered card as a fallback if `navigate` is unavailable.
      Files: `frontend/src/pages/Inscription.jsx`
      Verify: `cd frontend && npm run build` — builds without errors.

- [ ] 11. **Register `/verifier-email` route in `frontend/src/App.jsx`**.
      Add `const VerifierOTP = lazy(() => import("./pages/VerifierOTP"))`. Add `<Route path="/verifier-email" element={<Invite><VerifierOTP /></Invite>} />` in the public routes block alongside `/connexion`.
      Files: `frontend/src/App.jsx`
      Verify: `cd frontend && npm run build` — builds without errors. `cd backend && .venv\Scripts\pytest.exe` — all tests still pass.

---

## FEAT-002 — LOT B: Enriched messages (images, fichiers, vocal, reactions, reply, date separators)

**Design decisions:**
- `texte` becomes `blank=True` so media messages can have no text — existing rows are unaffected (they already have text). The `default="texte"` on the new `type` field covers all existing rows.
- Upload and message creation are combined in a single `MessagesMediaView.post` — client sends one multipart request; the server creates the Message and returns it serialized. This avoids a two-step upload-then-send.
- Reactions are broadcast as `reaction.maj` WS events; the frontend invalidates the messages cache rather than patching in-place, keeping the React Query pattern consistent with the rest of the app.
- Simulated waveform for voice messages uses deterministic heights from the message ID hash — no external library needed.
- Date separator grouping uses `Intl.DateTimeFormat("fr-FR")` for locale-correct "Lundi 14 oct." labels.

---

- [ ] 12. **Extend `Message` model in `backend/discussions/models.py`**.
      Add fields after `texte`: `type` (CharField max_length=10, default="texte", choices), `fichier` (FileField upload_to="messages/%Y/%m/", null=True, blank=True), `nom_fichier` (CharField max_length=255, blank=True), `taille_fichier` (PositiveIntegerField null=True, blank=True), `duree_vocale` (PositiveSmallIntegerField null=True, blank=True), `en_reponse_a` (ForeignKey "self", null=True, blank=True, SET_NULL, related_name="reponses"). Change `texte` field to add `blank=True` (keep `max_length=2000`).
      Add `ReactionMessage` model: `message` (FK Message CASCADE, related_name="reactions"), `user` (FK U CASCADE), `emoji` (CharField max_length=8). Meta: UniqueConstraint on [message, user, emoji] named "reaction_unique", Index on [message].
      Files: `backend/discussions/models.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 13. **Create migration for enriched Message and ReactionMessage**.
      Run `cd backend && .venv\Scripts\python.exe manage.py makemigrations discussions`. Output: `backend/discussions/migrations/0002_message_enrichi.py`. Confirm `default="texte"` is present on the `type` field and that SQLite-compatible `AlterField` is used for `texte blank=True`.
      Files: `backend/discussions/migrations/0002_message_enrichi.py` (generated)
      Verify: `cd backend && .venv\Scripts\python.exe manage.py migrate` — applies cleanly. `cd backend && .venv\Scripts\pytest.exe` — all existing tests pass.

- [ ] 14. **Extend `serialiser_message()` and add `serialiser_reactions()` in `backend/discussions/services.py`**.
      Add to the returned dict: `"type": m.type`, `"fichier_url": m.fichier.url if m.fichier else None`, `"nom_fichier": m.nom_fichier`, `"taille_fichier": m.taille_fichier`, `"duree_vocale": m.duree_vocale`, `"en_reponse_a": {"id": m.en_reponse_a.pk, "texte": m.en_reponse_a.texte[:80], "auteur_id": m.en_reponse_a.auteur_id} if m.en_reponse_a_id else None`, `"reactions": []`.
      Add `serialiser_reactions(msg_id, user_id)` → uses `ReactionMessage.objects.filter(message_id=msg_id).values("emoji").annotate(nb=Count("id")).order_by("-nb")` and a separate exists-check for `moi`.
      Update `serialiser_message()` signature to accept an optional `user_id=None` param; if provided, call `serialiser_reactions(m.pk, user_id)` to populate reactions (used in REST GET; WS broadcast passes no user_id and gets empty list for speed).
      Files: `backend/discussions/services.py`
      Verify: `cd backend && .venv\Scripts\pytest.exe` — all existing tests pass (extra fields in dict are backward-compatible).

- [ ] 15. **Extend `envoyer_message()` in `backend/discussions/services.py`** to accept `type="texte"`, `fichier=None`, `nom_fichier=""`, `taille_fichier=None`, `duree_vocale=None`, `en_reponse_a_id=None`. Remove the `if not texte: raise ValidationError` guard when `type != "texte"` — replace with: if type is "texte" and texte is empty, raise. Pass new fields to `Message.objects.create()`.
      Files: `backend/discussions/services.py`
      Verify: `cd backend && .venv\Scripts\pytest.exe` — all existing tests pass.

- [ ] 16. **Add `MessagesMediaView` and `ReactionView` to `backend/discussions/views.py`**.
      `MessagesMediaView` (POST `/conversations/<pk>/messages/media/`): `throttle_scope="message"`. Accepts `multipart/form-data`. Gets `fichier = request.FILES.get("fichier")`. Validates MIME (image/\* or audio/\*) and size (≤ 10MB). Determine type: `"vocal"` if audio/\*, `"image"` if image/\*, else `"fichier"`. Call extended `envoyer_message(user, pk, texte="", type=type, fichier=fichier, nom_fichier=fichier.name, taille_fichier=fichier.size)`. Return serialized message with 201.
      `ReactionView` (POST/DELETE `/conversations/<pk>/messages/<msg_id>/reactions/`): validates user is participant in conversation (use `contexte()`). POST: `ReactionMessage.objects.get_or_create(message_id=msg_id, user=request.user, emoji=emoji[:8])`. DELETE: deletes it. Both: broadcast `{"type": "reaction.maj", "conversation": pk, "message_id": msg_id}` to all conversation participants via `diffuser()`.
      Files: `backend/discussions/views.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.

- [ ] 17. **Update `MessagesView.post` in `backend/discussions/views.py`** to extract `fichier` from `request.FILES` when present and pass it through `envoyer_message()`. The existing JSON path (texte only) continues working unchanged.
      Files: `backend/discussions/views.py`
      Verify: `cd backend && .venv\Scripts\pytest.exe` — all existing tests pass.

- [ ] 18. **Add new routes in `backend/discussions/urls.py`**.
      Add: `path("conversations/<int:pk>/messages/media/", views.MessagesMediaView.as_view())` and `path("conversations/<int:pk>/messages/<int:msg_id>/reactions/", views.ReactionView.as_view())`.
      Files: `backend/discussions/urls.py`
      Verify: `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues. `cd backend && .venv\Scripts\pytest.exe` — all tests pass.

- [ ] 19. **Handle `reaction.maj` WS event in `frontend/src/temps-reel/TempsReel.jsx`**.
      In the `traiter(d)` function, add an `else if (d.type === "reaction.maj")` branch that calls `qc.invalidateQueries({ queryKey: ["messages", String(d.conversation)] })`.
      Files: `frontend/src/temps-reel/TempsReel.jsx`
      Verify: `cd frontend && npm run build` — no errors.

- [ ] 20. **Add `useReagir` and `useUploadMedia` hooks to `frontend/src/api/discussions.js`**.
      `useReagir(convId)`: `useMutation` that accepts `{msgId, emoji, supprimer}`. `supprimer=true` uses DELETE, else POST to `/conversations/${convId}/messages/${msgId}/reactions/`. `onSuccess`: `qc.invalidateQueries({queryKey: ["messages", String(convId)]})`.
      `useUploadMedia(convId)`: `useMutation` that accepts a `File` object. Builds `FormData` with key `"fichier"`. POSTs to `/conversations/${convId}/messages/media/` using `api()` with `{method:"POST", body: formData}` (no `Content-Type` header — let the browser set multipart boundary). Returns the created message object.
      Files: `frontend/src/api/discussions.js`
      Verify: `cd frontend && npm run build` — no errors.

- [ ] 21. **Refactor `frontend/src/pages/Conversation.jsx` — utility functions and state**.
      Add these at the top of the file (outside the component): `formatDuree(sec)` → `"MM:SS"` string; `formatTaille(bytes)` → human-readable "1.2 Mo"; `grouper(liste)` → array of `{separateur: "Aujourd'hui"} | {message: m}` interleaved by day boundary using `Intl.DateTimeFormat("fr-FR", {weekday:"long", day:"numeric", month:"short"})`. Inside the component add state: `enReponseA` (null), `selectedFile` (null — shape: `{file, previewUrl, mimeType}`), `isRecording` (false). Add refs: `fileInputRef`, `mediaRecorderRef`, `chunksRef`.
      Files: `frontend/src/pages/Conversation.jsx`
      Verify: `cd frontend && npm run build` — no errors.

- [ ] 22. **Implement bubble sub-components in `frontend/src/pages/Conversation.jsx`**.
      Replace the single `<div className="bulle-msg">` rendering with a dispatch on `m.type`:
      - `BulleTexte`: existing bubble + quoted reply mini-div (if `m.en_reponse_a`) with `borderLeft: "3px solid var(--accent-sec)"` + reactions pills below bubble.
      - `BulleImage`: `<img>` capped at `max-width: 260px, borderRadius: "0.75rem"` + click handler opening a `.visionneuse` fullscreen modal (reuse existing CSS class) + filename/size below.
      - `BulleFichier`: emoji icon by extension + filename + size + `<a href={m.fichier_url} download>` button.
      - `BulleVocale`: play/pause button using `.plus` CSS class + 20 simulated waveform bars + duration. Audio via `new Audio(m.fichier_url)` in a ref; `isPlaying` state toggled on button click.
      Date separators: render `<div className="separateur-date">` between day groups from `grouper()`. Add `.separateur-date` styles inline via `style` prop (text-align center, font-size 0.75rem, color var(--texte-doux), margin 0.5rem 0, display flex, gap 0.5rem, align-items center — no new CSS class required).
      Files: `frontend/src/pages/Conversation.jsx`
      Verify: `cd frontend && npm run build` — no errors.

- [ ] 23. **Implement enriched send form (📎, 🎤, reply banner) in `frontend/src/pages/Conversation.jsx`**.
      In the `<form className="saisie">` area, before the textarea:
      - If `enReponseA`: render a citation banner `<div>` (grey card, quoted text truncated to 60 chars, × button that calls `setEnReponseA(null)`).
      - If `selectedFile`: render a preview strip (thumbnail for images, filename for audio) with × to clear.
      After the textarea, before the Send button:
      - 📎 button → `fileInputRef.current.click()`. Hidden `<input type="file" accept="image/*,audio/*" ref={fileInputRef} onChange={onFileSelected}>`. `onFileSelected`: sets `selectedFile` with `URL.createObjectURL(file)` preview.
      - 🎤 button → toggles recording. `startRecording()` calls `navigator.mediaDevices.getUserMedia({audio:true})`, creates `MediaRecorder(stream)`, collects chunks via `ondataavailable`. `stopRecording()` calls `recorder.stop()` — `onstop` assembles `Blob`, creates a File, sets `selectedFile`.
      Modify `envoyerMessage()`: if `selectedFile` is set, call `uploadMedia.mutateAsync(selectedFile.file)` (from `useUploadMedia(id)`) — the mutation creates the message server-side and updates React Query cache; then clear `selectedFile`. If plain text + `enReponseA`, POST text message with body `{texte, cid, en_reponse_a_id: enReponseA.id}` (add `en_reponse_a` to WS `message.send` payload too for WS path). After send, `setEnReponseA(null)`.
      Add hover-reply button: wrap each message `<div>` in a container with `position: relative`. On `onMouseEnter`/`onMouseLeave`, show/hide a small reply button (Lucide `Reply` icon, size 14) positioned absolutely at the message edge. On click: `setEnReponseA(m)`.
      Files: `frontend/src/pages/Conversation.jsx`
      Verify: `cd frontend && npm run build` — no errors. `cd backend && .venv\Scripts\pytest.exe` — all tests pass.

---

## Final integration check

- [ ] 24. **Run full verification suite**.
      `cd backend && .venv\Scripts\python.exe manage.py check` — 0 issues.
      `cd backend && .venv\Scripts\pytest.exe` — all tests green.
      `cd frontend && npm run build` — clean build.
      Spot-check: `POST /api/auth/otp/envoyer/` with a known user email logs OTP to console. `POST /api/auth/otp/verifier/` with the logged code returns JWT tokens.
      Files: none (verification only)
      Verify: all three commands above succeed.
