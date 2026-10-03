import os

os.environ.setdefault("DJANGO_DEBUG", "1")
os.environ.setdefault("DJANGO_SECRET_KEY", "dev-only-insecure-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///db.sqlite3")
