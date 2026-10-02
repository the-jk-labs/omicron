import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { readable } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import Layout from "../../src/routes/+layout.svelte";
import { apiError, fakeFetch } from "../fakeFetch";
import { post } from "../fixtures";

const route = vi.hoisted(() => ({
  id: "/" as string | null,
  href: "http://localhost/",
  data: {} as Record<string, unknown>,
}));
vi.mock(
  import("$app/stores"),
  () =>
    ({
      get page() {
        return readable({ url: new URL(route.href), route: { id: route.id }, data: route.data, params: {} });
      },
      navigating: readable(null),
      updated: readable({ current: false }),
    }) as never,
);

function at(id: string | null, path: string, pageData: Record<string, unknown> = {}) {
  route.id = id;
  route.href = `http://localhost${path}`;
  route.data = pageData;
}

const child = createRawSnippet(() => ({ render: () => "<p>Child content</p>" }));

function setup(layoutData: Record<string, unknown> = {}, children = child) {
  vi.stubGlobal("fetch", fakeFetch({ "*": apiError(404) }).fetch);
  return render(Layout, {
    props: {
      data: { user: null, discover: null, instance: { name: "Starlog" }, seo: null, ...layoutData } as never,
      children,
    },
  });
}

const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
const og = (property: string) => document.head.querySelector(`meta[property="${property}"]`)?.getAttribute("content");
const link = (selector: string) =>
  document.head.querySelector<HTMLLinkElement>(`link${selector}`)?.getAttribute("href");
function jsonLd() {
  const text = document.head.querySelector('script[type="application/ld+json"]')?.textContent;
  return text ? JSON.parse(text) : null;
}

beforeEach(() => at("/", "/"));

test("the home page describes the site under the instance's own name", () => {
  setup();
  expect(screen.getByText("Child content")).toBeInTheDocument();
  expect(og("og:title")).toBe("Starlog: an independent blogging platform on the fediverse");
  expect(og("og:type")).toBe("website");
  expect(og("og:site_name")).toBe("Starlog");
  expect(meta("description")).toMatch(/^Starlog: an independent blogging platform/);
  expect(og("og:image")).toBe("http://localhost/og-image.png");
  expect(meta("robots")).toBeUndefined();
  expect(jsonLd()["@type"]).toBe("WebSite");
});

test("absolute URLs use the configured domain and drop the query string", () => {
  at("/", "/?utm_source=x");
  setup({ instance: { name: "Starlog", domain: "blog.example" } });
  expect(link('[rel="canonical"]')).toBe("https://blog.example/");
  expect(og("og:url")).toBe("https://blog.example/");
  expect(og("og:image")).toBe("https://blog.example/og-image.png");
});

test.for(["/settings", "/admin/users", "/posts/manage", "/search?q=x", "/notifications"])(
  "%s is kept out of the index",
  (path) => {
    at("/x", path);
    setup();
    expect(meta("robots")).toBe("noindex, nofollow");
    expect(jsonLd()).toBe(null);
  },
);

test("a published article under /posts stays indexable", () => {
  at("/posts/[id]", "/posts/9e962281");
  setup();
  expect(meta("robots")).toBeUndefined();
});

test("auth pages stand alone: noindex, minimal nav, no rails", () => {
  at("/login", "/login");
  setup();
  expect(meta("robots")).toBe("noindex, nofollow");
  expect(screen.queryByRole("link", { name: "Search" })).toBe(null);
  expect(document.querySelector("aside")).toBe(null);
});

test("turning indexing off noindexes everything and drops feeds", () => {
  at("/[handle]", "/@ada", { remote: false, profile: { user: { username: "ada", displayName: "Ada", bio: "" } } });
  setup({ seo: { indexingEnabled: false } });
  expect(meta("robots")).toBe("noindex, nofollow");
  expect(link('[type="application/rss+xml"]')).toBeUndefined();
});

test("only known search-engine verification tokens become meta tags", () => {
  setup({ seo: { verification: { google: "g-token", bing: "", yandex: "y-token", evil: "x" } } });
  expect(meta("google-site-verification")).toBe("g-token");
  expect(meta("yandex-verification")).toBe("y-token");
  expect(meta("msvalidate.01")).toBeUndefined();
  expect(document.head.querySelector('meta[name="evil"]')).toBe(null);
});

function atPost(p: Partial<Post>) {
  const full = post(p);
  at("/[handle]/[slug]", `/@${full.author.username}/${full.slug ?? full.id}`, { post: full });
  return full;
}

test("an article gets article Open Graph, author attribution and its author's feed", () => {
  atPost({
    summary: " A short summary ",
    language: "az",
    tags: [{ slug: "deno", name: "Deno" }],
    bannerUrl: "/api/uploads/banner.png",
  });
  setup();
  expect(og("og:type")).toBe("article");
  expect(og("og:title")).toBe("Hello world");
  expect(og("og:description")).toBe("A short summary");
  expect(og("article:tag")).toBe("Deno");
  expect(meta("fediverse:creator")).toBe("@ada@localhost");
  expect(og("og:locale")).toBe("az");
  expect(link('[hreflang="az"]')).toBe("http://localhost/@ada/hello-world");
  // Uploads are shared as their JPEG derivative (WhatsApp drops WebP og:images).
  expect(og("og:image")).toBe("http://localhost/api/uploads/og/banner.jpg");
  expect(link('[type="application/rss+xml"]')).toBe("/@ada/feed.xml");
  const ld = jsonLd();
  expect(ld.map((d: { "@type": string }) => d["@type"])).toEqual(["BlogPosting", "BreadcrumbList"]);
});

test("an article without a summary is described by its body", () => {
  atPost({ contentHtml: "<p>Tom &amp; Jerry</p>" });
  setup();
  expect(og("og:description")).toBe("Tom & Jerry");
  expect(og("og:locale")).toBe("en");
});

test("a federated article is noindex, follow with no canonical, feed or JSON-LD", () => {
  atPost({
    remote: true,
    slug: null,
    author: { id: "r1", username: "zed@social.example", displayName: "Zed", avatarUrl: null, remote: true },
  });
  setup();
  expect(meta("robots")).toBe("noindex, follow");
  expect(link('[rel="canonical"]')).toBeUndefined();
  expect(meta("fediverse:creator")).toBe("@zed@social.example");
  expect(link('[type="application/rss+xml"]')).toBeUndefined();
  expect(jsonLd()).toBe(null);
});

test("a profile is titled by its owner and advertises its feed and actor", () => {
  at("/[handle]", "/@ada", {
    remote: false,
    profile: {
      user: { username: "ada", displayName: "Ada", bio: "x".repeat(200) },
      counts: { followers: 0, following: 0 },
    },
  });
  setup({ instance: { name: "Starlog", federationEnabled: true } });
  expect(og("og:title")).toBe("Ada · Starlog");
  expect(og("og:description")).toBe(`${"x".repeat(157)}…`);
  expect(link('[type="application/rss+xml"]')).toBe("/@ada/feed.xml");
  expect(link('[type="application/activity+json"]')).toBe("http://localhost/users/ada");
  expect(jsonLd()["@type"]).toBe("ProfilePage");
});

test("a profile without a bio gets a generated description; no actor link while not federating", () => {
  at("/[handle]", "/@ada", { remote: false, profile: { user: { username: "ada", displayName: "Ada", bio: " " } } });
  setup();
  expect(og("og:description")).toBe(
    "Read articles by Ada (@ada) on Starlog. Follow their writing across the fediverse.",
  );
  expect(link('[type="application/activity+json"]')).toBeUndefined();
});

test("a cached remote profile is noindex, follow and has no feed", () => {
  at("/[handle]", "/@zed@social.example", {
    remote: true,
    profile: { user: { username: "zed@social.example", displayName: "Zed", bio: "" } },
  });
  setup({ instance: { name: "Starlog", federationEnabled: true } });
  expect(meta("robots")).toBe("noindex, follow");
  expect(link('[type="application/rss+xml"]')).toBeUndefined();
  expect(link('[type="application/activity+json"]')).toBeUndefined();
});

test.for([
  [1, 1, "1 article, 1 follower"],
  [2, 0, "2 articles, 0 followers"],
] as const)("a tag page with %i posts and %i followers says so", ([postCount, followerCount, phrase]) => {
  at("/tags/[tag]", "/tags/deno", { detail: { tag: { name: "deno" }, postCount, followerCount } });
  setup();
  expect(og("og:title")).toBe("#deno · Starlog");
  expect(og("og:description")).toContain(phrase);
});

test("only a public reading list advertises a feed", () => {
  at("/lists/[id]", "/lists/l1", { list: { title: "Reads", visibility: "public" } });
  const { unmount } = setup();
  expect(link('[type="application/rss+xml"]')).toBe("/lists/l1/feed.xml");
  unmount();
  at("/lists/[id]", "/lists/l1", { list: { title: "Reads", visibility: "private" } });
  setup();
  expect(link('[type="application/rss+xml"]')).toBeUndefined();
});

test("a render error in a page is contained with a way back", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = createRawSnippet(() => ({
    render: () => {
      throw new Error("boom");
    },
  }));
  setup({}, broken);
  expect(screen.getByRole("heading", { name: "This page didn't load" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  expect(error).toHaveBeenCalledWith("Unhandled render error:", expect.any(Error));
});
