import html as html_lib
import re

import nh3

TAGS = {"p", "br", "strong", "em", "u", "h2", "h3", "ul", "ol", "li", "a"}
SEPARATEURS = re.compile(r"</(?:p|li|h2|h3)>|<br\s*/?>", re.I)


def nettoyer_html(brut):
    return nh3.clean(brut, tags=TAGS, attributes={"a": {"href"}},
                     url_schemes={"http", "https", "mailto"},
                     link_rel="noopener noreferrer nofollow")


def texte_brut(propre):
    sans_balises = nh3.clean(SEPARATEURS.sub(" ", propre), tags=set())
    return " ".join(html_lib.unescape(sans_balises).split())


def extrait(propre, n=280):
    return texte_brut(propre)[:n]
