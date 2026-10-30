export type LicenceParagraph = { text: string; heading: boolean };

/** The licence's hard-wrapped plain text as paragraphs that reflow to the screen; short title lines are headings. */
export function licenceParagraphs(text: string): LicenceParagraph[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()))
    .filter((lines) => lines.some(Boolean))
    .map((lines) => {
      const joined = lines.filter(Boolean).join(" ");
      const single = lines.filter(Boolean).length === 1;
      const heading = single && (joined === joined.toUpperCase() || /^\d+\. [^.]+\.$/.test(joined));
      return { text: joined, heading };
    });
}
