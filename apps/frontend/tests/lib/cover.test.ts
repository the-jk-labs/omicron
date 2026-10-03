// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { absoluteBanner, firstBodyImage, postCardUrl, profileCardUrl } from "#lib/cover.js";

const ORIGIN = "https://blog.example";

describe("firstBodyImage", () => {
  test("the first image's src, trimmed", () => {
    expect(firstBodyImage('<p>x</p><img alt="a" src=" /api/uploads/a.webp "><img src="/b.png">')).toBe(
      "/api/uploads/a.webp",
    );
  });

  test.for(["<p>no images</p>", '<img src="">', '<img data-src="x.png">', '<imgx src="x.png">'])(
    "none in %s",
    (html) => {
      expect(firstBodyImage(html)).toBe(null);
    },
  );
});

describe("absoluteBanner", () => {
  test("an upload is published as its JPEG share derivative", () => {
    expect(absoluteBanner("/api/uploads/abc-123.webp", ORIGIN)).toBe(`${ORIGIN}/api/uploads/og/abc-123.jpg`);
    expect(absoluteBanner("/api/uploads/abc.jpeg", ORIGIN)).toBe(`${ORIGIN}/api/uploads/og/abc.jpg`);
  });

  test("an absolute URL elsewhere is left as is (normalized)", () => {
    expect(absoluteBanner("https://images.example/a b.png", ORIGIN)).toBe("https://images.example/a%20b.png");
  });

  test.for([
    null,
    undefined,
    "",
    "/relative/elsewhere.png",
    "images/a.png",
    "//cdn.example/a.png",
    "data:image/png;base64,AA",
    "/api/uploads/../x.png",
    "/api/uploads/a.svg",
  ])("%o has no usable absolute form", (url) => {
    expect(absoluteBanner(url, ORIGIN)).toBeUndefined();
  });
});

describe("postCardUrl", () => {
  const base = { id: "p1", title: "Hi", remote: false, createdAt: "2026-01-01T00:00:00Z" };

  test("versioned by last change, else creation", () => {
    expect(postCardUrl({ ...base, updatedAt: "2026-01-02T00:00:00Z" }, ORIGIN)).toBe(
      `${ORIGIN}/api/og/posts/p1.jpg?v=${Date.parse("2026-01-02T00:00:00Z")}`,
    );
    expect(postCardUrl(base, ORIGIN)).toBe(`${ORIGIN}/api/og/posts/p1.jpg?v=${Date.parse(base.createdAt)}`);
    expect(postCardUrl({ ...base, createdAt: "junk" }, ORIGIN)).toBe(`${ORIGIN}/api/og/posts/p1.jpg?v=0`);
  });

  test.for([
    ["a remote post", { ...base, remote: true }],
    ["an untitled post", { ...base, title: "  " }],
    ["no post", null],
  ] as const)("none for %s", ([, p]) => {
    expect(postCardUrl(p, ORIGIN)).toBeUndefined();
  });
});

describe("profileCardUrl", () => {
  test("local usernames get a versioned card", () => {
    expect(profileCardUrl({ user: { username: "ada_9", updatedAt: "2026-01-01T00:00:00Z" } }, ORIGIN)).toBe(
      `${ORIGIN}/api/og/profiles/ada_9.jpg?v=${Date.parse("2026-01-01T00:00:00Z")}`,
    );
    expect(profileCardUrl({ user: { username: "ada" } }, ORIGIN)).toBe(`${ORIGIN}/api/og/profiles/ada.jpg?v=0`);
  });

  test.for(["bob@remote.example", "ab", "UPPER", "x".repeat(31)])("none for %s", (username) => {
    expect(profileCardUrl({ user: { username } }, ORIGIN)).toBeUndefined();
  });

  test("none without a profile", () => {
    expect(profileCardUrl(null, ORIGIN)).toBeUndefined();
  });
});
