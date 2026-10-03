import io
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

TAILLE_MAX_OCTETS = 12 * 1024 * 1024
PIXELS_MAX = 50_000_000
COTE_MIN = 200
FORMATS = {"JPEG", "PNG", "WEBP"}
RATIO_MIN, RATIO_MAX = 0.6, 2.2
Image.MAX_IMAGE_PIXELS = PIXELS_MAX

# (clé, côté maximal en pixels, qualité WebP)
TAILLES_PUBLICATION = (("grande", 2048, 90), ("moyenne", 1080, 85), ("mini", 480, 80))
TAILLES_AVATAR = (("grande", 800, 90), ("mini", 160, 82))


class ImageInvalide(ValueError):
    pass


def _srgb(img, icc):
    """Convertit les couleurs vers sRGB pour que les photos gardent leur rendu."""
    if not icc or img.mode not in ("RGB", "RGBA"):
        return img
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        cible = ImageCms.createProfile("sRGB")
        alpha = img.getchannel("A") if img.mode == "RGBA" else None
        rgb = ImageCms.profileToProfile(img.convert("RGB"), source, cible, outputMode="RGB")
        if alpha is not None:
            rgb.putalpha(alpha)
        return rgb
    except (ImageCms.PyCMSError, OSError, ValueError):
        return img


def _ouvrir(fichier):
    if fichier.size > TAILLE_MAX_OCTETS:
        raise ImageInvalide("Image trop lourde (12 Mo maximum).")
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

    mode_origine = img.mode
    icc = img.info.get("icc_profile") if mode_origine in ("RGB", "RGBA") else None
    img = ImageOps.exif_transpose(img)  # applique l'orientation de l'appareil photo
    transparent = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if transparent else "RGB")
    img = _srgb(img, icc)
    if min(img.size) < COTE_MIN:
        raise ImageInvalide("Image trop petite (200 pixels minimum).")
    return img


def _webp(img, cote_max, qualite):
    larg, haut = img.size
    echelle = min(1.0, cote_max / max(larg, haut))  # jamais d'agrandissement
    if echelle < 1.0:
        img = img.resize((round(larg * echelle), round(haut * echelle)), Image.LANCZOS, reducing_gap=2.0)
    sortie = io.BytesIO()
    img.save(sortie, "WEBP", quality=qualite, method=4)
    return ContentFile(sortie.getvalue(), name=f"{uuid.uuid4().hex}.webp"), img.size


def preparer_image(fichier, tailles=TAILLES_PUBLICATION, verifier_ratio=True):
    """Retourne les variantes (grande, moyenne, mini) et les dimensions de l'image principale."""
    img = _ouvrir(fichier)
    if verifier_ratio and not RATIO_MIN <= img.width / img.height <= RATIO_MAX:
        raise ImageInvalide("Format non pris en charge. Recadrez l'image en 16:9, 4:3, 1:1 ou 4:5.")
    cote = max(img.size)
    res = {}
    for i, (cle, cote_max, qualite) in enumerate(tailles):
        if i > 0 and cote_max >= cote:
            continue  # variante inutile : la source est déjà plus petite
        res[cle], taille = _webp(img, cote_max, qualite)
        if i == 0:
            res["largeur"], res["hauteur"] = taille
    return res


def preparer_avatar(fichier):
    """Photo de profil : carré centré, en deux tailles."""
    img = _ouvrir(fichier)
    cote = min(img.size)
    img = ImageOps.fit(img, (cote, cote), Image.LANCZOS)  # sécurité si le recadrage n'était pas carré
    return {cle: _webp(img, cote_max, qualite)[0] for cle, cote_max, qualite in TAILLES_AVATAR}
