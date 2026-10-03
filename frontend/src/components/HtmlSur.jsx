import DOMPurify from "dompurify";
import { useMemo } from "react";

const OPTIONS = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h2", "h3", "ul", "ol", "li", "a"],
  ALLOWED_ATTR: ["href"],
  ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
};

DOMPurify.addHook("afterSanitizeAttributes", (n) => {
  if (n.tagName === "A") {
    n.setAttribute("rel", "noopener noreferrer nofollow");
    n.setAttribute("target", "_blank");
  }
});

// Défense en profondeur : le serveur nettoie déjà le HTML, le navigateur le nettoie encore.
export default function HtmlSur({ html }) {
  const propre = useMemo(() => DOMPurify.sanitize(html || "", OPTIONS), [html]);
  return <div className="contenu-riche" dangerouslySetInnerHTML={{ __html: propre }} />;
}
