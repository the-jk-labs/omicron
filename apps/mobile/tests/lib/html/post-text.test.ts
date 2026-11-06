import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/lib/format"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    excerpt: vi.fn<typeof actual.excerpt>(actual.excerpt),
    readTime: vi.fn<typeof actual.readTime>(actual.readTime),
  };
});

const { excerpt, readTime } = await import("@/lib/format");

// A fresh module per test: the remembered results are module state.
async function load() {
  vi.resetModules();
  return import("@/lib/html/post-text");
}

beforeEach(() => {
  vi.mocked(excerpt).mockClear();
  vi.mocked(readTime).mockClear();
});

describe("postExcerpt", () => {
  test("gives the same text as excerpt, computing it once per body", async () => {
    const { postExcerpt } = await load();
    expect(postExcerpt("<p>Hello world</p>")).toBe("Hello world");
    expect(postExcerpt("<p>Hello world</p>")).toBe("Hello world");
    expect(excerpt).toHaveBeenCalledOnce();
  });

  test("remembers an empty excerpt too", async () => {
    const { postExcerpt } = await load();
    expect(postExcerpt("<p></p>")).toBe("");
    expect(postExcerpt("<p></p>")).toBe("");
    expect(excerpt).toHaveBeenCalledOnce();
  });

  test("an edited body is computed afresh", async () => {
    const { postExcerpt } = await load();
    postExcerpt("<p>Before</p>");
    expect(postExcerpt("<p>After</p>")).toBe("After");
    expect(excerpt).toHaveBeenCalledTimes(2);
  });
});

describe("postReadTime", () => {
  test("gives the same minutes as readTime, computing them once per body", async () => {
    const { postReadTime } = await load();
    const body = `<p>${"word ".repeat(600)}</p>`;
    expect(postReadTime(body)).toBe(3);
    expect(postReadTime(body)).toBe(3);
    expect(readTime).toHaveBeenCalledOnce();
  });

  test("forgets the least recently used body past its limit", async () => {
    const { postReadTime } = await load();
    postReadTime("<p>0</p>");
    for (let i = 1; i < 200; i++) postReadTime(`<p>${i}</p>`);
    postReadTime("<p>0</p>"); // used again, so <p>1</p> is now the oldest
    postReadTime("<p>new</p>");
    vi.mocked(readTime).mockClear();

    postReadTime("<p>0</p>");
    expect(readTime).not.toHaveBeenCalled();
    postReadTime("<p>1</p>");
    expect(readTime).toHaveBeenCalledOnce();
  });
});
