import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Bold, Italic, Link as LienIcone, List, Underline as SouligneIcone } from "lucide-react";

const URL_OK = /^(https?:\/\/|mailto:)/i;

function Btn({ actif, onClick, label, children }) {
  return (
    <button type="button" className="outil" aria-pressed={actif} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export default function Editeur({ initial, onChange }) {
  const editor = useEditor({
    extensions: [
      // Titres de niveau 2 et 3 : le titre de la publication est déjà le niveau 1 de la page.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false, protocols: ["http", "https", "mailto"] }),
    ],
    content: initial || "",
    editorProps: { attributes: { class: "editeur-zone", "aria-label": "Contenu de la publication" } },
    onUpdate: ({ editor: e }) => onChange(e.getHTML(), e.getText().trim().length),
  });
  if (!editor) return null;

  function lien() {
    const url = window.prompt("Adresse du lien (https://...)", editor.getAttributes("link").href ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!URL_OK.test(url)) {
      window.alert("Le lien doit commencer par https://");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="carte" style={{ padding: 0 }}>
      <div className="barre-editeur" role="toolbar" aria-label="Mise en forme">
        <Btn label="Gras" actif={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={18} />
        </Btn>
        <Btn label="Italique" actif={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={18} />
        </Btn>
        <Btn label="Souligné" actif={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <SouligneIcone size={18} />
        </Btn>
        <span className="sep" />
        <Btn label="Titre 1" actif={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H1
        </Btn>
        <Btn label="Titre 2" actif={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H2
        </Btn>
        <Btn label="Liste à puces" actif={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={18} />
        </Btn>
        <span className="sep" />
        <Btn label="Lien" actif={editor.isActive("link")} onClick={lien}>
          <LienIcone size={18} />
        </Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
