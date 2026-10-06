import hashlib
import html
import ipaddress
import socket
from email.message import Message as EmailMessage
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import urllib3
from django.core.cache import cache
from rest_framework.exceptions import ValidationError

MAX_TAILLE_HTML = 256 * 1024
DUREE_CACHE = 6 * 60 * 60
MAX_REDIRECTIONS = 3


class _ConnexionHTTPFixee(urllib3.connection.HTTPConnection):
    def __init__(self, *args, ip_cible, **kwargs):
        self.ip_cible = ip_cible
        super().__init__(*args, **kwargs)

    def _new_conn(self):
        return urllib3.util.connection.create_connection(
            (self.ip_cible, self.port), self.timeout, source_address=self.source_address,
            socket_options=self.socket_options,
        )


class _ConnexionHTTPSFixee(urllib3.connection.HTTPSConnection):
    def __init__(self, *args, ip_cible, **kwargs):
        self.ip_cible = ip_cible
        super().__init__(*args, **kwargs)

    def _new_conn(self):
        return urllib3.util.connection.create_connection(
            (self.ip_cible, self.port), self.timeout, source_address=self.source_address,
            socket_options=self.socket_options,
        )


class _PoolHTTPFixe(urllib3.HTTPConnectionPool):
    ConnectionCls = _ConnexionHTTPFixee


class _PoolHTTPSFixe(urllib3.HTTPSConnectionPool):
    ConnectionCls = _ConnexionHTTPSFixee


def _hote_public(hote):
    try:
        adresses = {
            resultat[4][0]
            for resultat in socket.getaddrinfo(hote, None, type=socket.SOCK_STREAM)
        }
    except (OSError, UnicodeError):
        raise ValidationError({"url": "Le domaine de ce lien ne peut pas être vérifié."})
    if not adresses:
        raise ValidationError({"url": "Le domaine de ce lien ne peut pas être vérifié."})
    for adresse in adresses:
        ip = ipaddress.ip_address(adresse)
        if not ip.is_global:
            raise ValidationError({"url": "Les liens vers des adresses privées ne sont pas autorisés."})
    return sorted(adresses)[0]


def _normaliser_url(url):
    try:
        morceaux = urlsplit(url)
        port = morceaux.port
    except (TypeError, ValueError):
        raise ValidationError({"url": "Adresse de lien invalide."})
    if (
        morceaux.scheme.lower() not in {"http", "https"}
        or not morceaux.hostname
        or morceaux.username is not None
        or morceaux.password is not None
        or port not in (
            None,
            80 if morceaux.scheme.lower() == "http" else 443,
        )
        or len(url) > 2048
    ):
        raise ValidationError({"url": "Seuls les liens HTTP(S) publics sont acceptés."})
    try:
        hote = morceaux.hostname.encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise ValidationError({"url": "Nom de domaine invalide."})
    ip = _hote_public(hote)
    port_effectif = port or (443 if morceaux.scheme.lower() == "https" else 80)
    chemin = morceaux.path or "/"
    cible = urlunsplit((morceaux.scheme.lower(), morceaux.netloc, chemin, morceaux.query, ""))
    return cible, morceaux.scheme.lower(), hote, port_effectif, ip, chemin + (
        f"?{morceaux.query}" if morceaux.query else ""
    )


def _telecharger_html(url):
    courant = url
    for _ in range(MAX_REDIRECTIONS + 1):
        courant, scheme, hote, port, ip, cible = _normaliser_url(courant)
        pool_type = _PoolHTTPSFixe if scheme == "https" else _PoolHTTPFixe
        pool = pool_type(
            hote,
            port=port,
            ip_cible=ip,
            maxsize=1,
            block=True,
            **({"server_hostname": hote, "assert_hostname": hote} if scheme == "https" else {}),
        )
        try:
            reponse = pool.request(
                "GET",
                cible,
                headers={
                    "Host": hote,
                    "User-Agent": "BakhitaLinkPreview/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Encoding": "identity",
                },
                redirect=False,
                retries=False,
                preload_content=False,
                timeout=urllib3.Timeout(connect=3.0, read=3.0),
            )
            if reponse.status in (301, 302, 303, 307, 308):
                emplacement = reponse.headers.get("Location")
                reponse.close()
                pool.close()
                if not emplacement:
                    break
                courant = urljoin(courant, emplacement)
                continue
            if reponse.status < 200 or reponse.status >= 300:
                raise urllib3.exceptions.HTTPError(f"Réponse distante HTTP {reponse.status}")
            type_contenu = reponse.headers.get("Content-Type", "").lower()
            if "text/html" not in type_contenu and "application/xhtml+xml" not in type_contenu:
                raise urllib3.exceptions.HTTPError("Le lien ne pointe pas vers une page HTML.")
            contenu = reponse.read(MAX_TAILLE_HTML + 1, decode_content=True)
            if len(contenu) > MAX_TAILLE_HTML:
                raise urllib3.exceptions.HTTPError("La page distante est trop volumineuse.")
            entete_type = EmailMessage()
            entete_type["content-type"] = type_contenu
            encodage = entete_type.get_content_charset() or "utf-8"
            return contenu.decode(encodage, errors="replace"), courant
        finally:
            pool.close()
    raise urllib3.exceptions.HTTPError("Trop de redirections pour ce lien.")


class _ExtracteurOpenGraph(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.titre_page = []
        self._titre = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            cle = (attrs.get("property") or attrs.get("name") or "").strip().lower()
            valeur = (attrs.get("content") or "").strip()
            if cle and valeur and cle not in self.meta:
                self.meta[cle] = valeur
        elif tag == "title":
            self._titre = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._titre = False

    def handle_data(self, data):
        if self._titre:
            self.titre_page.append(data)


def lire_apercu(url):
    normalisee, *_ = _normaliser_url(url)
    cle = "open-graph:" + hashlib.sha256(normalisee.encode("utf-8")).hexdigest()
    resultat = cache.get(cle)
    if resultat is not None:
        return resultat
    contenu, url_finale = _telecharger_html(normalisee)
    extracteur = _ExtracteurOpenGraph()
    extracteur.feed(contenu)
    morceaux = urlsplit(url_finale)
    resultat = {
        "url": url_finale,
        "domaine": morceaux.netloc,
        "titre": html.unescape(
            extracteur.meta.get("og:title")
            or extracteur.meta.get("twitter:title")
            or " ".join(extracteur.titre_page)
        )[:300],
        "description": html.unescape(
            extracteur.meta.get("og:description")
            or extracteur.meta.get("twitter:description")
            or extracteur.meta.get("description", "")
        )[:500],
    }
    cache.set(cle, resultat, DUREE_CACHE)
    return resultat
