import type { EditorBridge } from "@10play/tentap-editor";
import type { EditorCommand, OmicronEditorState } from "./omicron-bridge";

// Native-only helpers for the bridge; omicron-bridge.ts itself also runs in the editor WebView.

type Runnable = { run: (command: EditorCommand) => void };

const hasRun = (editor: object): editor is Runnable => "run" in editor && typeof editor.run === "function";

/** The bridge's `run`, which TenTap merges into the editor instance without typing it. */
export const commandsOf = (editor: EditorBridge): Runnable["run"] => (hasRun(editor) ? editor.run : () => undefined);

/** The bridge's part of TenTap's merged editor state, once the editor has reported it. */
export const isOmicronState = (state: object): state is OmicronEditorState =>
  "active" in state && "headingLevel" in state;
