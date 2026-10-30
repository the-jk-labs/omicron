import { useThemeColors } from "@/hooks/use-theme-colors";

// The editor WebView can't read the app's theme, so the current token values are written into its CSS.
// Rules follow the web's `.prose-omicron` (apps/frontend/src/app.css).
export function useEditorCss(): string {
  const [background, foreground, alt, muted, mutedFg, border] = useThemeColors([
    "--color-background",
    "--color-foreground",
    "--color-foreground-alt",
    "--color-muted",
    "--color-muted-foreground",
    "--color-border",
  ]);

  return `
    * { -webkit-tap-highlight-color: transparent; }
    html, body { background: ${background}; color: ${foreground}; margin: 0; }
    body { font-family: "Source Sans 3", -apple-system, Roboto, "Segoe UI", sans-serif; }
    .tiptap { min-height: 60vh; padding: 0 20px 120px; outline: none; font-size: 17px; line-height: 1.75; caret-color: ${foreground}; }
    .tiptap p { margin: 0.6em 0; }
    .tiptap h1 { font-size: 1.875rem; margin: 1.4em 0 0.5em; }
    .tiptap h2 { font-size: 1.5rem; margin: 1.3em 0 0.4em; }
    .tiptap h3 { font-size: 1.25rem; margin: 1.2em 0 0.3em; }
    .tiptap h4, .tiptap h5 { font-size: 1.05rem; margin: 1.1em 0 0.3em; }
    .tiptap h6 { font-size: 0.875rem; text-transform: uppercase; color: ${mutedFg}; }
    .tiptap a { color: ${foreground}; text-decoration: underline; }
    .tiptap blockquote { margin: 1.2em 0; padding-left: 1.1em; border-left: 3px solid ${foreground}; color: ${alt}; font-style: italic; }
    .tiptap pre { background: ${muted}; border-radius: 8px; padding: 14px; overflow-x: auto; font-size: 13px; }
    .tiptap code { background: ${muted}; border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.9em; }
    .tiptap pre code { background: none; padding: 0; }
    .tiptap hr { border: 0; border-top: 1px solid ${border}; margin: 2em 0; }
    .tiptap img { display: block; max-width: 100%; height: auto; margin: 1.2em auto; border-radius: 16px; }
    .tiptap img.ProseMirror-selectednode { outline: 2px solid ${foreground}; }
    .tiptap table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
    .tiptap th, .tiptap td { border: 1px solid ${border}; padding: 6px 10px; vertical-align: top; }
    .tiptap th { background: ${muted}; }
    .tiptap .selectedCell { background: ${border}; }
    .tiptap p.is-empty::before { content: attr(data-placeholder); color: ${mutedFg}; float: left; height: 0; pointer-events: none; }
  `;
}
