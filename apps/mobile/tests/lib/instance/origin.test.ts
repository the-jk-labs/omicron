import { describe, expect, test } from "vitest";
import { hostOf, mediaUrl, normalizeOrigin, resolveUrl } from "@/lib/instance/origin";

describe("normalizeOrigin", () => {
  test.each([
    ["omicron.blog", "https://omicron.blog"],
    ["  Omicron.Blog/  ", "https://omicron.blog"],
    ["https://omicron.blog/@ada/post", "https://omicron.blog"],
    ["@omicron.blog", "https://omicron.blog"],
    ["blog.example.com:8443", "https://blog.example.com:8443"],
    ["http://localhost:5173", "http://localhost:5173"],
    ["http://192.168.1.20:8000", "http://192.168.1.20:8000"],
  ])("%s → %s", (input, origin) => {
    expect(normalizeOrigin(input)).toBe(origin);
  });

  test.each([
    ["", "empty"],
    ["not a host", "no dot"],
    ["http://omicron.blog", "plain HTTP to a public host"],
    ["ftp://omicron.blog", "another protocol"],
    ["https://user:pass@omicron.blog", "credentials in the URL"],
  ])("rejects %s (%s)", (input) => {
    expect(normalizeOrigin(input)).toBeNull();
  });
});

describe("media URLs", () => {
  const origin = "https://blog.test";

  test("root-relative URLs resolve against the instance", () => {
    expect(resolveUrl(origin, "/api/uploads/a.webp")).toBe("https://blog.test/api/uploads/a.webp");
    expect(mediaUrl(origin, "/api/uploads/a.webp")).toBe("https://blog.test/api/uploads/a.webp");
  });

  test("external images go through the instance's proxy, as on the web", () => {
    expect(mediaUrl(origin, "https://cdn.example/x.png?a=1")).toBe(
      "https://blog.test/api/media/proxy?url=https%3A%2F%2Fcdn.example%2Fx.png%3Fa%3D1",
    );
  });

  test("missing URLs stay missing", () => {
    expect(mediaUrl(origin, null)).toBeUndefined();
    expect(mediaUrl(origin, "")).toBeUndefined();
  });

  test("hostOf", () => {
    expect(hostOf("https://omicron.blog")).toBe("omicron.blog");
  });
});
