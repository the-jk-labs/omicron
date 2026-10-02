// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { escapeHtml, htmlToText, textToNoteHtml } from "@/lib/html.ts";

describe("escapeHtml", () => {
  test("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  test("escapes ampersands first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  test("leaves plain text alone", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("")).toBe("");
  });
});

describe("htmlToText", () => {
  test("is empty for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  test("flattens a Mastodon-style bio", () => {
    expect(htmlToText("<p>Hello &amp; welcome</p><p>Second <span>line</span></p>")).toBe(
      "Hello & welcome\nSecond line",
    );
  });

  test.for(["<br>", "<br/>", "<br />", "<BR>", "< br >"])("treats %j as a line break", (br) => {
    expect(htmlToText(`a${br}b`)).toBe("a\nb");
  });

  test("ends blocks at closing p/div/li/h1-h6", () => {
    expect(htmlToText("<h1>T</h1><div>d</div><ul><li>x</li><li>y</li></ul>")).toBe("T\nd\nx\ny");
  });

  test("collapses runs of blank lines to one blank line", () => {
    expect(htmlToText("a<br><br><br><br>b")).toBe("a\n\nb");
  });

  test("collapses horizontal whitespace and trims around newlines", () => {
    expect(htmlToText("  a   \t b  <br>   c  ")).toBe("a b\nc");
  });

  test("decodes named entities case-insensitively", () => {
    expect(htmlToText("&lt;&GT;&quot;&apos;&#39;&nbsp;&AMP;")).toBe(`<>"'' &`);
  });

  test("decodes decimal and hex numeric entities", () => {
    expect(htmlToText("&#65;&#x42;&#X43;&#x1F600;")).toBe("ABC😀");
  });

  test("leaves unknown entities as written", () => {
    expect(htmlToText("&bogus; &copy;")).toBe("&bogus; &copy;");
  });

  test("does not double-decode an escaped entity", () => {
    expect(htmlToText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  test("drops tags but keeps their text", () => {
    expect(htmlToText('<a href="https://x.test"><b>bold</b> link</a>')).toBe("bold link");
  });

  test("survives an out-of-range numeric entity from a remote actor", () => {
    expect(() => htmlToText("<p>hi &#99999999;</p>")).not.toThrow();
  });

  test("survives an out-of-range hex entity from a remote actor", () => {
    expect(() => htmlToText("&#x110000;")).not.toThrow();
  });
});

describe("textToNoteHtml", () => {
  test("wraps each non-empty line in an escaped paragraph", () => {
    expect(textToNoteHtml("one\n\n  two  \n<script>")).toBe("<p>one</p><p>two</p><p>&lt;script&gt;</p>");
  });

  test("is empty for blank input", () => {
    expect(textToNoteHtml("")).toBe("");
    expect(textToNoteHtml(" \n \n")).toBe("");
  });

  test("round-trips through htmlToText (modulo blank lines)", () => {
    const text = 'Tom & Jerry say "hi" <3';
    expect(htmlToText(textToNoteHtml(text))).toBe(text);
  });
});
