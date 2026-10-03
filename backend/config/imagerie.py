import io
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

TAILLE_MAX_OCTETS = 5 * 1024 * 1024
PIXELS_MAX = 40_000_000
FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = PIXELS_MAX


class ImageInvalide(ValueError):
    pass


def nettoyer_image(fichier, cote_max=1280, carre=False, qualite=82):
    """Vérifie le fichier, supprime les métadonnées (EXIF, GPS), redimensionne et ré-encode en WebP."""
    if fichier.size > TAILLE_MAX_OCTETS:
        raise ImageInvalide("Image trop lourde (5 Mo maximum).")
    try:
        fichier.seek(0)
        img = Image.open(fichier)
        if img.format not in FORMATS:
            raise ImageInvalide("Formats acceptés : JPEG, PNG ou WebP.")
        if img.width * img.height > PIXELS_MAX:
            raise ImageInvalide("Image trop grande.")
        img.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise ImageInvalide("Fichier image invalide.")
    img = ImageOps.exif_transpose(img)
    if carre:
        img = ImageOps.fit(img, (cote_max, cote_max), method=Image.LANCZOS)
    else:
        img.thumbnail((cote_max, cote_max), Image.LANCZOS)
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    sortie = io.BytesIO()
    img.save(sortie, "WEBP", quality=qualite, method=4)
    return ContentFile(sortie.getvalue(), name=f"{uuid.uuid4().hex}.webp")
