import { renderHook } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";
import { useEditorCss } from "@/components/composer/editor-css";

vi.mock("@/hooks/use-theme-colors", () => ({
  useThemeColors: () => ["#fff", "#111", "#555", "#f4f4f5", "#71717a", "#e4e4e7"],
}));

test("sets the composer body in Source Serif 4 (400) and headings in semibold (600)", async () => {
  const { result } = await renderHook(() => useEditorCss());
  expect(result.current).toContain('font-family: "Source Serif 4"');
  expect(result.current).toContain("font-weight: 400");
  expect(result.current).toContain(
    ".tiptap h1, .tiptap h2, .tiptap h3, .tiptap h4, .tiptap h5, .tiptap h6 { font-weight: 600; }",
  );
});
