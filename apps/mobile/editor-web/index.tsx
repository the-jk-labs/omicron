import { CoreBridge, EditorContent, useTenTap } from "@10play/tentap-editor";
import { Placeholder } from "@tiptap/extension-placeholder";
import { StarterKit } from "@tiptap/starter-kit";
import { createRoot } from "react-dom/client";
import { extensions } from "#lib/editor/extensions";
import { OmicronBridge } from "@/lib/editor/omicron-bridge";

// The web's editor extensions, so the app produces exactly the HTML and JSON the web does. TenTap's
// CoreBridge already provides the document, paragraph and text nodes, so StarterKit leaves them out here.
const editorExtensions = [
  ...extensions.map((extension) =>
    extension.name === StarterKit.name
      ? StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          link: false,
          document: false,
          paragraph: false,
          text: false,
        })
      : extension,
  ),
  Placeholder.configure({ placeholder: ({ pos }) => (pos === 0 ? "Tell your story…" : "Write something…") }),
];

function Editor() {
  const editor = useTenTap({
    bridges: [CoreBridge, OmicronBridge],
    tiptapOptions: {
      extensions: editorExtensions,
      editorProps: { attributes: { class: "tiptap prose-omicron" } },
    },
  });
  return <EditorContent editor={editor} />;
}

declare global {
  interface Window {
    contentInjected?: boolean;
  }
}

// React Native WebView on Android can run the page before its injected content is in place.
const mount = setInterval(() => {
  if (!window.contentInjected) return;
  createRoot(document.getElementById("root")!).render(<Editor />);
  clearInterval(mount);
}, 1);
