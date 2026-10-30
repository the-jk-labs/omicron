import { describe, expect, test } from "vitest";
import { parseHtml } from "@/lib/html/parse";

describe("parseHtml", () => {
  test("paragraphs carry inline marks and links", () => {
    expect(parseHtml('<p>Hello <strong>bold <em>both</em></strong> <a href="https://x.test">link</a></p>')).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Hello ", marks: {} },
          { type: "text", text: "bold ", marks: { bold: true } },
          { type: "text", text: "both", marks: { bold: true, italic: true } },
          { type: "text", text: " ", marks: {} },
          { type: "text", text: "link", marks: { href: "https://x.test" } },
        ],
      },
    ]);
  });

  test("entities are decoded and edge whitespace trimmed", () => {
    expect(parseHtml("<p>\n  5 &lt; 7 &amp; it&#39;s  </p>")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "5 < 7 & it's", marks: {} }] },
    ]);
  });

  test("headings, rules, quotes and nested lists", () => {
    const parsed = parseHtml(
      '<h2>Title</h2><hr><blockquote><p>Quoted</p></blockquote><ol start="3"><li><p>One</p><ul><li>Nested</li></ul></li></ol>',
    );
    expect(parsed.map((block) => block.type)).toEqual(["heading", "rule", "blockquote", "list"]);
    expect(parsed[0]).toMatchObject({ level: 2 });
    expect(parsed[3]).toMatchObject({
      ordered: true,
      start: 3,
      items: [[{ type: "paragraph" }, { type: "list", ordered: false, items: [[{ type: "paragraph" }]] }]],
    });
  });

  test("code blocks keep their text, declared language and caption", () => {
    expect(
      parseHtml(
        '<figure class="code-figure"><figcaption>app.ts</figcaption><pre><code class="language-ts">const a = 1 &lt; 2;\n</code></pre></figure>',
      ),
    ).toEqual([{ type: "code", code: "const a = 1 < 2;", language: "ts", title: "app.ts" }]);
    expect(parseHtml('<pre data-title="run.sh"><code>ls</code></pre>')).toEqual([
      { type: "code", code: "ls", language: null, title: "run.sh" },
    ]);
  });

  test("an image alone in a paragraph is a figure, with the editor's width", () => {
    expect(parseHtml('<p><img src="/api/uploads/a.webp" alt="A cat"></p><img src="b.png" width="50%">')).toEqual([
      { type: "image", src: "/api/uploads/a.webp", alt: "A cat", widthPercent: null },
      { type: "image", src: "b.png", alt: "", widthPercent: 50 },
    ]);
  });

  test("tables keep header rows and cell content", () => {
    const [table] = parseHtml(
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><p>1</p></td></tr></tbody></table>",
    );
    expect(table).toEqual({
      type: "table",
      rows: [
        { header: true, cells: [[{ type: "paragraph", children: [{ type: "text", text: "A", marks: {} }] }]] },
        { header: false, cells: [[{ type: "paragraph", children: [{ type: "text", text: "1", marks: {} }] }]] },
      ],
    });
  });

  test("details and display math", () => {
    expect(
      parseHtml('<details><summary>More</summary><p>Hidden</p></details><math display="block"><mi>x</mi></math>'),
    ).toEqual([
      {
        type: "details",
        summary: [{ type: "text", text: "More", marks: {} }],
        children: [{ type: "paragraph", children: [{ type: "text", text: "Hidden", marks: {} }] }],
      },
      { type: "math", mathml: '<math display="block"><mi>x</mi></math>', tex: "", display: true },
    ]);
  });

  test("loose inline content between blocks becomes a paragraph", () => {
    expect(parseHtml("Intro <b>text</b><p>Next</p>tail")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Intro ", marks: {} },
          { type: "text", text: "text", marks: { bold: true } },
        ],
      },
      { type: "paragraph", children: [{ type: "text", text: "Next", marks: {} }] },
      { type: "paragraph", children: [{ type: "text", text: "tail", marks: {} }] },
    ]);
  });

  test("empty paragraphs are dropped", () => {
    expect(parseHtml("<p> </p><p></p>")).toEqual([]);
  });
});
