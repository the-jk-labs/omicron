import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { licenceParagraphs } from "@/lib/licence";
import { LICENCE_TEXT } from "@/lib/licence-text";

describe("licence", () => {
  test("the app ships the repository's LICENSE unchanged", () => {
    expect(LICENCE_TEXT).toBe(readFileSync(new URL("../../../../LICENSE", import.meta.url), "utf8"));
  });

  test("reflows wrapped lines into paragraphs and spots headings", () => {
    const paragraphs = licenceParagraphs(
      "  GNU AFFERO GENERAL PUBLIC LICENSE\n\n  0. Definitions.\n\n  A long sentence\n  wrapped here.\n \n",
    );
    expect(paragraphs).toEqual([
      { text: "GNU AFFERO GENERAL PUBLIC LICENSE", heading: true },
      { text: "0. Definitions.", heading: true },
      { text: "A long sentence wrapped here.", heading: false },
    ]);
  });

  test("the real text splits into many paragraphs with its sections as headings", () => {
    const paragraphs = licenceParagraphs(LICENCE_TEXT);
    expect(paragraphs.length).toBeGreaterThan(100);
    expect(paragraphs.filter((p) => p.heading).map((p) => p.text)).toContain("TERMS AND CONDITIONS");
  });
});
