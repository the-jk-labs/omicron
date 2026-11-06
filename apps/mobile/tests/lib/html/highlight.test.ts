import { describe, expect, test } from "vitest";
import { highlightCode } from "@/lib/html/highlight";

describe("highlightCode's memory", () => {
  test("a block rendered again reuses its tokens", () => {
    const source = "const a = 1;";
    expect(highlightCode(source, "javascript")).toBe(highlightCode(source, "javascript"));
  });

  test("the same code in another language is highlighted again", () => {
    const source = "print(1)";
    expect(highlightCode(source, "python")).not.toBe(highlightCode(source, "lua"));
  });

  test("the language and the code can't run together into one key", () => {
    const first = highlightCode("thon x", "py");
    const second = highlightCode("x", "pythonx");
    expect(first).not.toBe(second);
  });

  test("still falls back to plain text for empty or unknown input", () => {
    expect(highlightCode("   ", "javascript")).toEqual([{ text: "   " }]);
    expect(
      highlightCode("just some words", "not-a-language")
        .map((token) => token.text)
        .join(""),
    ).toBe("just some words");
  });

  test("forgets the oldest blocks instead of growing for good", () => {
    const first = highlightCode("oldest = 1", "python");
    for (let i = 0; i < 100; i++) highlightCode(`x${i} = 1`, "python");
    expect(highlightCode("oldest = 1", "python")).not.toBe(first);
  });
});
