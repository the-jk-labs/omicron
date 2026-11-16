// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { jsonTarget, MAX_JSON_BYTES, publicJsonFetcher } from "@/lib/publicJson.ts";

test.for([
  "https://peer.example/.well-known/nodeinfo",
  "https://api.fedidb.org/v1/software/omicron/servers?limit=20",
  "https://8.8.8.8/x",
])("accepts the public https URL %s", (url) => {
  expect(jsonTarget(url, false).href).toBe(new URL(url).href);
});

test.for([
  "http://peer.example/x",
  "https://127.0.0.1/x",
  "https://10.1.2.3/x",
  "https://[::1]/x",
  "https://user:pw@peer.example/x",
  "file:///etc/passwd",
  "not a url",
])("refuses %s", (url) => {
  expect(() => jsonTarget(url, false)).toThrow("Invalid URL.");
});

test("local development may use http and private hosts", () => {
  expect(jsonTarget("http://localhost:8000/x", true).host).toBe("localhost:8000");
  expect(() => jsonTarget("file:///etc/passwd", true)).toThrow("Invalid URL.");
});

describe("publicJsonFetcher", () => {
  let server: Server;
  let base = "";
  let userAgent: string | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      userAgent = req.headers["user-agent"];
      const send = (status: number, body: string, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(body);
      };
      if (req.url === "/ok") return send(200, '{"a":1}');
      if (req.url === "/hop") return send(302, "", { location: "/ok" });
      if (req.url === "/loop") return send(302, "", { location: "/loop" });
      if (req.url === "/escape") return send(302, "", { location: "file:///etc/passwd" });
      if (req.url === "/html") return send(200, "<html>");
      if (req.url === "/big") return send(200, `"${"x".repeat(MAX_JSON_BYTES + 10)}"`);
      send(503, "{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = (path: string) => publicJsonFetcher("Omicron/test", true)(`${base}${path}`, AbortSignal.timeout(5000));

  test("parses JSON and names itself", async () => {
    expect(await get("/ok")).toEqual({ a: 1 });
    expect(userAgent).toBe("Omicron/test");
  });

  test("follows a redirect, but not forever and not off the web", async () => {
    expect(await get("/hop")).toEqual({ a: 1 });
    await expect(get("/loop")).rejects.toThrow("Too many redirects.");
    await expect(get("/escape")).rejects.toThrow("Invalid URL.");
  });

  test("refuses errors, non-JSON and oversized bodies", async () => {
    await expect(get("/down")).rejects.toThrow("HTTP 503");
    await expect(get("/html")).rejects.toThrow("not JSON");
    await expect(get("/big")).rejects.toThrow(/too large|Unsupported/);
  });

  test("without the development escape hatch, a private host is refused before connecting", async () => {
    await expect(publicJsonFetcher("x", false)(`${base}/ok`, AbortSignal.timeout(5000))).rejects.toThrow(
      "Invalid URL.",
    );
  });
});
