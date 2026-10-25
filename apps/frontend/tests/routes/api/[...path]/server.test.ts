// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from "../../../../src/routes/api/[...path]/+server";

let seen: { url: string; init: RequestInit } | null;
let reply: () => Response;

beforeEach(() => {
  seen = null;
  reply = () => Response.json({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async (url, init) => {
      seen = { url: url instanceof Request ? url.url : url.toString(), init: init! };
      return reply();
    }),
  );
});

// What SvelteKit hands the endpoint: the rest param already decoded.
function proxyEvent(href: string, init: RequestInit = {}, clientAddress: string | Error = "198.51.100.7") {
  const url = new URL(href);
  const rest = decodeURIComponent(url.pathname.replace(/^\/api\//, ""));
  return {
    request: new Request(url, init),
    params: { path: rest },
    url,
    getClientAddress: () => {
      if (clientAddress instanceof Error) throw clientAddress;
      return clientAddress;
    },
  } as never;
}

test("forwards path, query and method to the backend, chasing no redirects", async () => {
  await GET(proxyEvent("https://blog.example/api/posts/p1/comments?cursor=abc"));
  expect(seen!.url).toBe("http://backend.test:8000/api/posts/p1/comments?cursor=abc");
  expect(seen!.init).toMatchObject({ method: "GET", redirect: "manual" });
  expect(seen!.init.body).toBeUndefined();
});

test.for(["instance/tls-check", "instance/tls-check/", "%69nstance/tls-check"])(
  "does not expose the internal TLS approval endpoint (%s)",
  async (path) => {
    const response = await GET(proxyEvent(`https://blog.example/api/${path}?domain=blog.example`));
    expect(response.status).toBe(404);
    expect(seen).toBeNull();
  },
);

test("request headers pass through, minus hop-by-hop ones; the client IP is set, never trusted", async () => {
  await GET(
    proxyEvent("https://blog.example/api/me", {
      headers: { cookie: "session=1", "x-forwarded-for": "6.6.6.6", connection: "keep-alive" },
    }),
  );
  const headers = new Headers(seen!.init.headers);
  expect(headers.get("cookie")).toBe("session=1");
  expect(headers.get("x-forwarded-for")).toBe("198.51.100.7");
  expect(headers.has("host")).toBe(false);
  expect(headers.has("connection")).toBe(false);
});

test("without an adapter address the spoofable header is dropped", async () => {
  await GET(
    proxyEvent("https://blog.example/api/me", { headers: { "x-forwarded-for": "6.6.6.6" } }, new Error("no address")),
  );
  expect(new Headers(seen!.init.headers).has("x-forwarded-for")).toBe(false);
});

test.for([
  ["POST", POST],
  ["PUT", PUT],
  ["PATCH", PATCH],
  ["DELETE", DELETE],
] as const)("%s forwards the body as raw bytes", async ([method, handler]) => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
  await handler(proxyEvent("https://blog.example/api/uploads", { method, body: bytes }));
  expect(seen!.init.method).toBe(method);
  expect(new Uint8Array(seen!.init.body as ArrayBuffer)).toEqual(bytes);
});

test("the response keeps its status, body, every Set-Cookie and only allowlisted headers", async () => {
  reply = () => {
    const headers = new Headers({
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000",
      etag: '"abc"',
      location: "https://blog.example/brand.png",
      "retry-after": "30",
      "x-powered-by": "Hono",
      server: "deno",
    });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/; HttpOnly");
    return new Response("bytes", { status: 302, headers });
  };
  const res = await GET(proxyEvent("https://blog.example/api/og/posts/p1.jpg"));
  expect(res.status).toBe(302);
  expect(await res.text()).toBe("bytes");
  expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/; HttpOnly"]);
  expect(res.headers.get("location")).toBe("https://blog.example/brand.png");
  expect(res.headers.get("retry-after")).toBe("30");
  expect(res.headers.get("etag")).toBe('"abc"');
  expect(res.headers.has("x-powered-by")).toBe(false);
  expect(res.headers.has("server")).toBe(false);
});

test("an encoded slash inside a path segment reaches the backend still encoded", async () => {
  await GET(proxyEvent("https://blog.example/api/tags/a%2Fb/posts"));
  expect(seen!.url).toBe("http://backend.test:8000/api/tags/a%2Fb/posts");
});

test("browser-client preflights and CORS authorization feedback survive the development proxy", async () => {
  reply = () =>
    new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH",
        "access-control-allow-headers": "Authorization,Content-Type",
        "access-control-expose-headers": "WWW-Authenticate,Retry-After",
        "access-control-max-age": "600",
      },
    });
  const res = await OPTIONS(
    proxyEvent("https://blog.example/api/posts", {
      method: "OPTIONS",
      headers: { origin: "https://client.example", "access-control-request-method": "PATCH" },
    }),
  );
  expect(seen!.init.method).toBe("OPTIONS");
  expect(new Headers(seen!.init.headers).get("origin")).toBe("https://client.example");
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  expect(res.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
});
