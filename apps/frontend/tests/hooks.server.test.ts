// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeFetch } from "./fakeFetch";

// The instance snapshot is cached module-wide; every test gets a fresh one.
async function load() {
  vi.resetModules();
  return (await import("../src/hooks.server")).handle;
}

type Instance = { domain: string | null; federationEnabled: boolean };
let instance: Instance;

beforeEach(() => {
  instance = { domain: "blog.example", federationEnabled: true };
});

async function run(
  href: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    lang?: string | null;
    body?: string;
    contentType?: string;
  } = {},
) {
  const handle = await load();
  const { fetch } = fakeFetch({ "GET /api/instance": () => Response.json(instance) });
  const url = new URL(href);
  const locals = { lang: opts.lang };
  const resolve = vi.fn(
    async (_event: unknown, o?: { transformPageChunk?: (x: { html: string; done: boolean }) => string }) => {
      const html = opts.body ?? '<html lang="%omicron.lang%"><p data-lang="%omicron.lang%"></p></html>';
      return new Response(o?.transformPageChunk?.({ html, done: true }) ?? html, {
        headers: { "content-type": opts.contentType ?? "text/html" },
      });
    },
  );
  const res = await handle({
    event: {
      url,
      fetch,
      locals,
      request: new Request(url, { method: opts.method ?? "GET", headers: opts.headers }),
    } as never,
    resolve: resolve as never,
  });
  return { res, resolve };
}

describe("canonical host", () => {
  test("a page on another hostname is moved permanently to the configured one", async () => {
    const { res, resolve } = await run("https://www.blog.example/@ada/post?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://blog.example/@ada/post?x=1");
    expect(resolve).not.toHaveBeenCalled();
    // The security headers ride on the redirect too.
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  test.for([
    ["a POST", { method: "POST" }, "https://www.blog.example/login"],
    ["the API", {}, "https://www.blog.example/api/posts"],
    ["the canonical host itself", {}, "https://blog.example/"],
  ] as const)("%s is left alone", async ([, opts, href]) => {
    const { res } = await run(href, opts);
    expect(res.status).toBe(200);
  });

  test("no domain configured, or a localhost instance, never redirects", async () => {
    instance.domain = null;
    expect((await run("https://anything.example/")).res.status).toBe(200);
    instance.domain = "localhost:5173";
    expect((await run("http://192.168.1.5:5173/")).res.status).toBe(200);
  });
});

describe("ActivityPub content negotiation on /@handle", () => {
  const AP = { accept: "application/activity+json" };

  test.for([
    "application/activity+json",
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    "text/html;q=0.5, application/activity+json",
    "application/activity+json, text/html",
  ])("%s is sent to the actor document", async (accept) => {
    const { res } = await run("https://blog.example/@ada", { headers: { accept } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/users/ada");
  });

  test.for([
    "text/html,application/xhtml+xml,*/*;q=0.8",
    "*/*",
    "application/json",
    "application/activity+json;q=0, text/html",
    "text/html, application/activity+json",
  ])("%s gets the page", async (accept) => {
    expect((await run("https://blog.example/@ada", { headers: { accept } })).res.status).toBe(200);
  });

  test("no Accept header gets the page", async () => {
    expect((await run("https://blog.example/@ada")).res.status).toBe(200);
  });

  test("remote handles, sub-pages and POSTs are never redirected", async () => {
    expect((await run("https://blog.example/@bob@remote.example", { headers: AP })).res.status).toBe(200);
    expect((await run("https://blog.example/@ada/post", { headers: AP })).res.status).toBe(200);
    expect((await run("https://blog.example/@ada", { headers: AP, method: "POST" })).res.status).toBe(200);
  });

  test("with federation off the page is the better answer", async () => {
    instance.federationEnabled = false;
    expect((await run("https://blog.example/@ada", { headers: AP })).res.status).toBe(200);
  });
});

describe("the rendered page", () => {
  test("<html lang> comes from the page's declared language, every placeholder replaced", async () => {
    const { res } = await run("https://blog.example/", { lang: "az-Latn" });
    expect(await res.text()).toBe('<html lang="az-Latn"><p data-lang="az-Latn"></p></html>');
  });

  test.for([null, undefined, "", '" onload="alert(1)', "english"])(
    "an unusable language (%o) falls back to en",
    async (lang) => {
      const { res } = await run("https://blog.example/", { lang });
      expect(await res.text()).toContain('lang="en"');
    },
  );

  test("HTML gets an explicit charset; other types and an existing charset are kept", async () => {
    expect((await run("https://blog.example/")).res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const kept = await run("https://blog.example/", { contentType: "text/html; charset=iso-8859-1" });
    expect(kept.res.headers.get("content-type")).toBe("text/html; charset=iso-8859-1");
    const json = await run("https://blog.example/", { contentType: "application/json" });
    expect(json.res.headers.get("content-type")).toBe("application/json");
  });
});

describe("security headers", () => {
  test("are set on every response", async () => {
    const { res } = await run("https://blog.example/");
    expect(Object.fromEntries([...res.headers].filter(([k]) => k !== "content-type"))).toEqual({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": expect.stringContaining("camera=()"),
      "cross-origin-opener-policy": "same-origin",
      "strict-transport-security": "max-age=63072000; includeSubDomains",
    });
  });

  test("HSTS only when the request really arrived over HTTPS", async () => {
    expect((await run("http://blog.example/")).res.headers.has("strict-transport-security")).toBe(false);
    const proxied = await run("http://blog.example/", { headers: { "x-forwarded-proto": "https" } });
    expect(proxied.res.headers.has("strict-transport-security")).toBe(true);
    const downgraded = await run("https://blog.example/", { headers: { "x-forwarded-proto": "http" } });
    expect(downgraded.res.headers.has("strict-transport-security")).toBe(false);
  });
});

describe("preloading", () => {
  const font = (file: string) => ({
    type: "font" as const,
    path: `/_app/immutable/assets/${file}`,
    filename: `node_modules/@fontsource-variable/${file.startsWith("inter") ? "inter" : "source-sans-3"}/files/${file}`,
  });

  // Found only after the stylesheet parsed, they arrived after first paint and the text swapped font.
  test("the interface font's Latin subsets are preloaded on every page", async () => {
    const { preloadFile } = await import("../src/hooks.server");
    expect(preloadFile(font("inter-latin-wght-normal.woff2"), "/")).toBe(true);
    expect(preloadFile(font("inter-latin-ext-wght-normal.woff2"), "/settings")).toBe(true);
  });

  test("other scripts, italics and the article font stay lazy", async () => {
    const { preloadFile } = await import("../src/hooks.server");
    for (const file of [
      "inter-cyrillic-wght-normal.woff2",
      "inter-greek-wght-normal.woff2",
      "inter-latin-wght-italic.woff2",
      "source-sans-3-latin-wght-normal.woff2",
    ])
      expect(preloadFile(font(file), "/"), file).toBe(false);
  });

  test("the article font is preloaded on a post page", async () => {
    const { preloadFile } = await import("../src/hooks.server");
    expect(preloadFile(font("source-sans-3-latin-wght-normal.woff2"), "/[handle]/[slug]")).toBe(true);
    expect(preloadFile(font("source-sans-3-latin-ext-wght-normal.woff2"), "/[handle]/[slug]")).toBe(true);
  });

  test("scripts and stylesheets keep SvelteKit's default preloading", async () => {
    const { preloadFile } = await import("../src/hooks.server");
    expect(preloadFile({ type: "js", path: "/a.js" }, "/")).toBe(true);
    expect(preloadFile({ type: "css", path: "/a.css" }, "/")).toBe(true);
    expect(preloadFile({ type: "asset", path: "/a.png" }, "/")).toBe(false);
  });
});
