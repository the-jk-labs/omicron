import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/lib/html/parse"), async (original) => {
  const actual = await original();
  return { ...actual, parseHtml: vi.fn<typeof actual.parseHtml>(actual.parseHtml) };
});

const { parseHtml } = await import("@/lib/html/parse");

// A fresh module per test: the cache and the idle queue are module state.
async function load() {
  vi.resetModules();
  return import("@/lib/html/parse-cache");
}

const idle: (() => void)[] = [];
beforeEach(() => {
  idle.length = 0;
  vi.mocked(parseHtml).mockClear();
  vi.stubGlobal("requestIdleCallback", (fn: () => void) => idle.push(fn));
});
const runIdle = () => {
  while (idle.length) idle.shift()!();
};

describe("parseCached", () => {
  test("parses a body once and returns the same blocks after", async () => {
    const { parseCached } = await load();
    const first = parseCached("<p>a</p>");
    expect(parseCached("<p>a</p>")).toBe(first);
    expect(parseHtml).toHaveBeenCalledOnce();
  });

  test("drops the least recently used body past its limit", async () => {
    const { parseCached, isParsed } = await load();
    parseCached("<p>0</p>");
    for (let i = 1; i < 40; i++) parseCached(`<p>${i}</p>`);
    parseCached("<p>0</p>"); // used again, so <p>1</p> is now the oldest
    parseCached("<p>new</p>");
    expect(isParsed("<p>0</p>")).toBe(true);
    expect(isParsed("<p>1</p>")).toBe(false);
  });
});

describe("parseWhenIdle", () => {
  test("parses queued bodies one per idle slot, skipping repeats", async () => {
    const { parseWhenIdle, isParsed } = await load();
    parseWhenIdle("<p>a</p>");
    parseWhenIdle("<p>a</p>");
    parseWhenIdle("<p>b</p>");
    expect(parseHtml).not.toHaveBeenCalled();
    idle.shift()!();
    expect(isParsed("<p>a</p>")).toBe(true);
    expect(isParsed("<p>b</p>")).toBe(false);
    runIdle();
    expect(isParsed("<p>b</p>")).toBe(true);
    expect(parseHtml).toHaveBeenCalledTimes(2);
  });

  test("ignores an empty body and one already parsed", async () => {
    const { parseCached, parseWhenIdle } = await load();
    parseCached("<p>a</p>");
    parseWhenIdle("<p>a</p>");
    parseWhenIdle("");
    expect(idle).toHaveLength(0);
  });
});
