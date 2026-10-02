import io
from uuid import uuid4

from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from rest_framework.exceptions import ValidationError

TAILLE_MAX_OCTETS = 5 * 1024 * 1024  # 5 Mo
DIMENSION_MAX_ORIGINE = 4096  # Protection contre les bombes de décompression
DIMENSION_CIBLE = 1600  # Redimensionnement max pour le stockage et l'affichage
FORMATS_AUTORISES = {"JPEG", "PNG", "WEBP"}
MIME_AUTORISES = {"image/jpeg", "image/png", "image/webp"}


def valider_et_traiter_image(fichier):
    """
    Valide et sécurise un fichier image téléversé :
    - Vérification de la taille (<= 5 Mo)
    - Vérification du type MIME
    - Validation par Pillow (format, intégrité, dimensions)
    - Suppression des métadonnées EXIF (protection de la vie privée / géolocalisation)
    - Redimensionnement si dimensions supérieures à DIMENSION_CIBLE
    - Conversion standardisée en WebP optimisé
    """
    if not fichier:
        return None

    # 1. Vérification de la taille
    if fichier.size > TAILLE_MAX_OCTETS:
        raise ValidationError({"image": "L'image ne doit pas dépasser 5 Mo."})

    # 2. Vérification du type MIME déclaré si présent
    content_type = getattr(fichier, "content_type", "")
    if content_type and content_type.lower() not in MIME_AUTORISES:
        raise ValidationError({"image": "Format non supporté. Formats acceptés : JPEG, PNG, WebP."})

    # 3. Ouverture et vérification Pillow
    try:
        fichier.seek(0)
        img = Image.open(fichier)
        img.verify()
    except Exception:
        raise ValidationError({"image": "Le fichier téléversé n'est pas une image valide."})

    # Réouverture après verify() car verify invalide l'objet Image
    fichier.seek(0)
    try:
        img = Image.open(fichier)
    except Exception:
        raise ValidationError({"image": "Impossible de lire l'image fournie."})

    if img.format not in FORMATS_AUTORISES:
        raise ValidationError({"image": f"Format d'image non autorisé ({img.format})."})

    larg, haut = img.size
    if larg > DIMENSION_MAX_ORIGINE or haut > DIMENSION_MAX_ORIGINE:
        raise ValidationError({"image": "Les dimensions de l'image dépassent la limite autorisée."})

    # 4. Normalisation de l'orientation selon l'EXIF avant suppression des métadonnées
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # 5. Conversion vers un mode compatible (supprime les canaux non supportés et les métadonnées)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img_propre = img.convert("RGBA")
        format_sortie = "WEBP"
    else:
        img_propre = img.convert("RGB")
        format_sortie = "WEBP"

    # 6. Redimensionnement proportionnel si trop grand
    img_propre.thumbnail((DIMENSION_CIBLE, DIMENSION_CIBLE), Image.Resampling.LANCZOS)

    # 7. Sauvegarde dans un buffer mémoire sans métadonnées
    tampon = io.BytesIO()
    img_propre.save(tampon, format=format_sortie, quality=85, optimize=True)
    tampon.seek(0)

    nom_fichier = f"{uuid4().hex}.webp"
    return ContentFile(tampon.getvalue(), name=nom_fichier)
