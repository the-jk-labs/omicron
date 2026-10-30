import { BridgeExtension } from "@10play/tentap-editor";
import type { Editor } from "@tiptap/core";

// One bridge between the native toolbar and the web's own Tiptap setup (apps/frontend/src/lib/editor),
// which runs unchanged inside the editor WebView. Shared by the native app and editor-web/.

/** Toolbar commands. Each maps to one Tiptap chain, run with focus kept in the editor. */
export type EditorCommand =
  | { name: "bold" | "italic" | "strike" | "code" | "codeBlock" | "blockquote" | "bulletList" | "orderedList" }
  | { name: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { name: "paragraph" | "horizontalRule" | "undo" | "redo" | "insertTable" | "deleteTable" }
  | { name: "addRowAfter" | "addColumnAfter" | "deleteRow" | "deleteColumn" | "toggleHeaderRow" }
  | { name: "link"; href: string | null }
  | { name: "image"; src: string; alt: string }
  | { name: "codeBlockLanguage"; language: string | null }
  | { name: "codeBlockTitle"; title: string | null };

export type OmicronEditorState = {
  active: Record<
    | "bold"
    | "italic"
    | "strike"
    | "code"
    | "codeBlock"
    | "blockquote"
    | "bulletList"
    | "orderedList"
    | "link"
    | "table",
    boolean
  >;
  headingLevel: number | null;
  canUndo: boolean;
  canRedo: boolean;
  activeLink: string | null;
  words: number;
};

type Message = { type: "omicron-command"; payload: EditorCommand };

const linkHref = (attributes: Record<string, unknown>) =>
  typeof attributes.href === "string" ? attributes.href : null;

export function runEditorCommand(editor: Editor, command: EditorCommand): boolean {
  const chain = editor.chain().focus();
  switch (command.name) {
    case "bold":
      return chain.toggleBold().run();
    case "italic":
      return chain.toggleItalic().run();
    case "strike":
      return chain.toggleStrike().run();
    case "code":
      return chain.toggleCode().run();
    case "codeBlock":
      return chain.toggleCodeBlock().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "heading":
      return chain.toggleHeading({ level: command.level }).run();
    case "paragraph":
      return chain.setParagraph().run();
    case "horizontalRule":
      return chain.setHorizontalRule().run();
    case "undo":
      return chain.undo().run();
    case "redo":
      return chain.redo().run();
    case "insertTable":
      return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "deleteTable":
      return chain.deleteTable().run();
    case "addRowAfter":
      return chain.addRowAfter().run();
    case "addColumnAfter":
      return chain.addColumnAfter().run();
    case "deleteRow":
      return chain.deleteRow().run();
    case "deleteColumn":
      return chain.deleteColumn().run();
    case "toggleHeaderRow":
      return chain.toggleHeaderRow().run();
    case "link":
      return command.href
        ? chain.extendMarkRange("link").setLink({ href: command.href }).run()
        : chain.extendMarkRange("link").unsetLink().run();
    case "image":
      return chain.setImage({ src: command.src, alt: command.alt }).run();
    case "codeBlockLanguage":
      return chain.updateAttributes("codeBlock", { language: command.language }).run();
    case "codeBlockTitle":
      return chain.updateAttributes("codeBlock", { title: command.title }).run();
    default: {
      const unknown: never = command;
      return unknown;
    }
  }
}

export const OmicronBridge = new BridgeExtension<
  OmicronEditorState,
  { run: (command: EditorCommand) => void },
  Message
>({
  forceName: "omicron",
  onBridgeMessage: (editor, message) => {
    if (message.type !== "omicron-command") return false;
    runEditorCommand(editor, message.payload);
    return true;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    run: (command) => sendBridgeMessage({ type: "omicron-command", payload: command }),
  }),
  extendEditorState: (editor) => {
    const heading = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive("heading", { level }));
    return {
      active: {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        strike: editor.isActive("strike"),
        code: editor.isActive("code"),
        codeBlock: editor.isActive("codeBlock"),
        blockquote: editor.isActive("blockquote"),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        link: editor.isActive("link"),
        table: editor.isActive("table"),
      },
      headingLevel: heading ?? null,
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      activeLink: linkHref(editor.getAttributes("link")),
      words: editor.state.doc.textContent.split(/\s+/).filter(Boolean).length,
    };
  },
});
