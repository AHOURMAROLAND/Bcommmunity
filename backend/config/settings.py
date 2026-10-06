import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# Chargement automatique du fichier .env s'il existe
for _env_fichier in (BASE_DIR.parent / ".env", BASE_DIR / ".env"):
    if _env_fichier.is_file():
        try:
            with open(_env_fichier, "r", encoding="utf-8") as _f:
                for _ligne in _f:
                    _ligne = _ligne.strip()
                    if _ligne and not _ligne.startswith("#") and "=" in _ligne:
                        _cle, _, _val = _ligne.partition("=")
                        _cle, _val = _cle.strip(), _val.strip().strip("'\"")
                        if _cle and _cle not in os.environ:
                            os.environ[_cle] = _val
            break
        except Exception:
            pass


def env(nom, defaut=None, requis=False):
    valeur = os.environ.get(nom, defaut)
    if requis and valeur in (None, ""):
        raise RuntimeError(f"Variable d'environnement manquante : {nom}")
    return valeur


DEBUG = env("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key" if DEBUG else None, requis=True)
ALLOWED_HOSTS = [h for h in env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]
ADMIN_URL = env("ADMIN_URL", "admin/")

INSTALLED_APPS = [
    # Daphne doit etre en premiere position pour les WebSockets ASGI
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "channels",
    "comptes",
    "profils",
    "scolarite",
    "amis",
    "publications",
    "discussions",
    "notifications",
    "signalements",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

# --- Base de donnees (Neon PostgreSQL en production, SQLite en dev) ---
DATABASES = {"default": dj_database_url.parse(
    env("DATABASE_URL", "sqlite:///db.sqlite3" if DEBUG else None, requis=not DEBUG),
    conn_max_age=60, conn_health_checks=True)}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
# Obligatoire avec le pooler PgBouncer de Neon (mode transaction)
if "postgresql" in DATABASES["default"].get("ENGINE", ""):
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
    DATABASES["default"].setdefault("OPTIONS", {})["connect_timeout"] = 15
elif "sqlite" in DATABASES["default"].get("ENGINE", ""):
    DATABASES["default"].setdefault("OPTIONS", {})["timeout"] = 30


# --- Configuration SQLite WAL pour éviter les blocages concurrents ---
from django.db.backends.signals import connection_created  # noqa: E402
from django.dispatch import receiver  # noqa: E402


@receiver(connection_created)
def _configurer_sqlite_wal(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA busy_timeout=30000;")

# --- Django Channels + Redis ---
REDIS_URL = env("REDIS_URL", "").strip()
if "pytest" in sys.modules or not REDIS_URL:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
else:
    CHANNEL_LAYERS = {"default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
            "capacity": 1500,
            "expiry": 10,
        },
    }}

CACHES = {"default": {
    "BACKEND": "django_redis.cache.RedisCache" if REDIS_URL else "django.core.cache.backends.locmem.LocMemCache",
    "LOCATION": REDIS_URL if REDIS_URL else "bakhita-cache",
    "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"} if REDIS_URL else {},
    "KEY_PREFIX": "bakhita",
}}

AUTH_USER_MODEL = "comptes.User"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
SITE_URL = env("SITE_URL", "http://localhost:5173")

# --- Stockage des media : Cloudflare R2 en production, disque local en dev ---
R2_BUCKET = env("R2_BUCKET", "")
if R2_BUCKET:
    R2_DOMAINE = env("R2_PUBLIC_DOMAIN", requis=True)
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "bucket_name": R2_BUCKET,
                "endpoint_url": f"https://{env('R2_ACCOUNT_ID', requis=True)}.r2.cloudflarestorage.com",
                "access_key": env("R2_ACCESS_KEY_ID", requis=True),
                "secret_key": env("R2_SECRET_ACCESS_KEY", requis=True),
                "region_name": "auto",
                "signature_version": "s3v4",
                "custom_domain": R2_DOMAINE,
                "querystring_auth": False,
                "file_overwrite": False,
                "default_acl": None,
                # Les noms de fichiers sont des UUID : cache immutable d'un an
                "object_parameters": {"CacheControl": "public, max-age=31536000, immutable"},
            },
        },
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
    MEDIA_URL = f"https://{R2_DOMAINE}/"
    MEDIA_ROOT = BASE_DIR / "media"
else:
    MEDIA_URL = "/media/"
    MEDIA_ROOT = BASE_DIR / "media"
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

# Securite
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CONTENT_TYPE_NOSNIFF = True
DATA_UPLOAD_MAX_MEMORY_SIZE = 10_485_760
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
SESSION_COOKIE_HTTPONLY = True
if not DEBUG:
    SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT", "1") == "1"
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

CORS_ALLOWED_ORIGINS = [o for o in env("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [o for o in env("CSRF_TRUSTED_ORIGINS", "").split(",") if o]
REFRESH_COOKIE_SAMESITE = env("REFRESH_COOKIE_SAMESITE", "Lax")

# Google & Email
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "")
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:5173")
PASSWORD_RESET_TIMEOUT = 3600

EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend" if DEBUG
                    else "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Bakhita Community <no-reply@bakhita.example>")
ADMIN_EMAIL = env("ADMIN_EMAIL", "")  # reçoit une alerte à chaque signalement
SEUIL_MASQUAGE_AUTO = int(env("SEUIL_MASQUAGE_AUTO", "3"))

# --- Brevo SMTP (actif uniquement si BREVO_SMTP_LOGIN est défini) ---
BREVO_SMTP_LOGIN = env("BREVO_SMTP_LOGIN", "")
BREVO_SMTP_PASSWORD = env("BREVO_SMTP_PASSWORD", "")
BREVO_API_KEY = env("BREVO_API_KEY", "")
if BREVO_SMTP_LOGIN:
    EMAIL_HOST = "smtp-relay.brevo.com"
    EMAIL_PORT = 587
    EMAIL_HOST_USER = BREVO_SMTP_LOGIN
    EMAIL_HOST_PASSWORD = BREVO_SMTP_PASSWORD
    EMAIL_USE_TLS = True
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["comptes.auth.ReseauJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min", "user": "240/min",
        "inscription": "5/hour", "connexion": "60/min", "rafraichir": "180/min",
        "reset": "5/hour", "google": "20/min", "demande_ami": "30/hour",
        "publier": "20/hour", "commenter": "60/hour", "like": "120/min", "photo": "10/hour",
        "invitation": "20/hour", "message": "120/min",
        "push": "20/hour",
        "push_reply": "20/min",
        "signalement": "10/hour",
        "otp_envoyer": "3/hour",
        "otp_verifier": "10/hour",
        "link_preview": "30/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

LOGGING = {
    "version": 1, "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# ---- Celery ----
from celery.schedules import crontab  # noqa: E402

CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://redis:6379/1")
CELERY_TASK_ALWAYS_EAGER = env("CELERY_EAGER", "0") == "1" or "pytest" in sys.modules
CELERY_TASK_SOFT_TIME_LIMIT = 120
CELERY_TASK_TIME_LIMIT = 150
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BEAT_SCHEDULE = {
    "resume-quotidien": {
        "task": "notifications.taches.resume_quotidien",
        "schedule": crontab(hour=int(env("RESUME_HEURE_UTC", "17")), minute=0),
    },
    "nettoyage": {
        "task": "notifications.taches.nettoyer",
        "schedule": crontab(hour=3, minute=30),
    },
    "suspensions": {
        "task": "comptes.taches.lever_suspensions_expirees",
        "schedule": crontab(minute="*/5"),
    },
}

# ---- Push (VAPID + FCM) ----
VAPID_PUBLIC_KEY    = env("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY   = env("VAPID_PRIVATE_KEY", "")
VAPID_ADMIN_EMAIL   = env("VAPID_ADMIN_EMAIL", "admin@bakhita.example")
FCM_SERVICE_ACCOUNT_JSON = env("FCM_SERVICE_ACCOUNT_JSON", "")

# ---- Google & CORS (M7 Natif & PWA) ----
from corsheaders.defaults import default_headers  # noqa: E402

GOOGLE_CLIENT_IDS = [c for c in env("GOOGLE_CLIENT_IDS", env("GOOGLE_CLIENT_ID", "")).split(",") if c]
CORS_ALLOW_HEADERS = (*default_headers, "x-client")
CORS_ALLOWED_ORIGINS = [
    o for o in env(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://localhost,capacitor://localhost"
    ).split(",") if o
]
CORS_ALLOW_CREDENTIALS = True
