import { beforeEach, describe, expect, test } from "vitest";
import { forgetBrowserLinks, pendingLink, resolveIncomingLink, routeIncomingLink } from "@/lib/instance/app-links";

const OMICRON = "https://omicron.blog";

describe("resolveIncomingLink", () => {
  test("opens the connected instance's posts, profiles, tags and lists in the app", () => {
    expect(resolveIncomingLink("https://omicron.blog/@arifastark/why-mr-reed-solomon", OMICRON)).toEqual({
      kind: "app",
      path: "/@arifastark/why-mr-reed-solomon",
    });
    expect(resolveIncomingLink("https://omicron.blog/@ada", OMICRON)).toEqual({ kind: "app", path: "/@ada" });
    expect(resolveIncomingLink("https://omicron.blog/tags/linux", OMICRON)).toEqual({
      kind: "app",
      path: "/tags/linux",
    });
    expect(resolveIncomingLink("https://omicron.blog/lists/42", OMICRON)).toEqual({ kind: "app", path: "/lists/42" });
  });

  test("maps the instance pages onto the app's routes for them", () => {
    expect(resolveIncomingLink("https://omicron.blog/about", OMICRON)).toEqual({
      kind: "app",
      path: "/instance/about",
    });
    expect(resolveIncomingLink("https://omicron.blog/privacy/", OMICRON)).toEqual({
      kind: "app",
      path: "/instance/privacy",
    });
  });

  test("keeps the query string and ignores a trailing slash", () => {
    expect(resolveIncomingLink("https://omicron.blog/@ada/hello/?ref=share", OMICRON)).toEqual({
      kind: "app",
      path: "/@ada/hello?ref=share",
    });
  });

  test("keeps non-ASCII slugs intact", () => {
    expect(resolveIncomingLink("https://omicron.blog/@ada/%C3%BCber-uns", OMICRON)).toEqual({
      kind: "app",
      path: "/@ada/%C3%BCber-uns",
    });
  });

  test("sends a link to another instance to the browser rather than showing it against the wrong server", () => {
    expect(resolveIncomingLink("https://omicron.blog/@ada/hello", "https://blog.example")).toEqual({
      kind: "browser",
      url: "https://omicron.blog/@ada/hello",
    });
  });

  test("sends links to the browser before an instance is chosen", () => {
    expect(resolveIncomingLink("https://omicron.blog/@ada", null)).toEqual({
      kind: "browser",
      url: "https://omicron.blog/@ada",
    });
  });

  test("leaves pages the app doesn't have, like feeds and settings, to the browser", () => {
    for (const path of ["/@ada/feed.xml", "/settings", "/login", "/reset-password", "/@ada/hello/edit", "/"]) {
      expect(resolveIncomingLink(`https://omicron.blog${path}`, OMICRON).kind).toBe("browser");
    }
  });

  test("passes app-scheme and relative links through untouched", () => {
    expect(resolveIncomingLink("omicron://posts/abc", OMICRON)).toEqual({ kind: "app", path: "omicron://posts/abc" });
    expect(resolveIncomingLink("/@ada", OMICRON)).toEqual({ kind: "app", path: "/@ada" });
  });
});

describe("routeIncomingLink", () => {
  beforeEach(() => {
    pendingLink.set(null);
    forgetBrowserLinks();
  });

  // Bug: with no instance chosen, a link went to a browser tab, which handed the verified link straight back to
  // the app, which sent it to the browser again: the app flashed forever.
  test("before an instance is chosen, a link opens the instance picker and is kept for afterwards", () => {
    expect(routeIncomingLink("https://omicron.blog/@ada/hello", null)).toEqual({ path: "/welcome" });
    expect(pendingLink.get()).toBe("https://omicron.blog/@ada/hello");
  });

  test("opens the connected instance's pages in the app", () => {
    expect(routeIncomingLink("https://omicron.blog/@ada", OMICRON)).toEqual({ path: "/@ada" });
  });

  test("a link handed back by the browser it was just sent to stays in the app", () => {
    const link = "https://omicron.blog/@ada/hello";
    expect(routeIncomingLink(link, "https://blog.example", 1_000)).toEqual({ path: "/", browser: link });
    expect(routeIncomingLink(link, "https://blog.example", 2_000)).toEqual({ path: "/" });
    expect(routeIncomingLink(link, "https://blog.example", 60_000)).toEqual({ path: "/", browser: link });
  });
});
