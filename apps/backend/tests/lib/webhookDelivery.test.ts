// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { generateSigningSecret, postWebhook, signatureHeader, webhookTarget } from "@/lib/webhookDelivery.ts";

describe("signatureHeader", () => {
  test("is an HMAC-SHA256 of the timestamp and body, as a receiver would compute it", async () => {
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex");
    expect(await signatureHeader("whsec_test", 1700000000, '{"a":1}')).toBe(`t=1700000000,v1=${expected}`);
  });

  test("changes with the secret, the timestamp and the body", async () => {
    const base = await signatureHeader("s", 1, "b");
    const v1 = (header: string) => header.split("v1=")[1];
    expect(v1(await signatureHeader("other", 1, "b"))).not.toBe(v1(base));
    expect(v1(await signatureHeader("s", 2, "b"))).not.toBe(v1(base));
    expect(v1(await signatureHeader("s", 1, "other"))).not.toBe(v1(base));
  });
});

test("signing secrets are prefixed and never repeat", () => {
  expect(generateSigningSecret()).toMatch(/^whsec_[0-9a-f]{64}$/);
  expect(generateSigningSecret()).not.toBe(generateSigningSecret());
});

describe("webhookTarget", () => {
  const redirects = ["https://app.example/oauth/callback", "org.example.reader:/oauth/callback"];

  test("accepts HTTPS on an origin the app already registered", () => {
    expect(webhookTarget("https://app.example/hook", redirects, false)?.href).toBe("https://app.example/hook");
  });

  test.each([
    ["another origin", "https://evil.example/hook"],
    ["plain HTTP", "http://app.example/hook"],
    ["embedded credentials", "https://user:pass@app.example/hook"],
    ["a fragment", "https://app.example/hook#part"],
    ["not a URL", "nope"],
    ["an oversized URL", `https://app.example/${"a".repeat(2048)}`],
  ])("refuses %s", (_label, input) => {
    expect(webhookTarget(input, redirects, false)).toBeNull();
  });

  test("refuses a private address or a custom port even when the app registered it", () => {
    expect(webhookTarget("https://127.0.0.1/hook", ["https://127.0.0.1/cb"], false)).toBeNull();
    expect(webhookTarget("https://[::1]/hook", ["https://[::1]/cb"], false)).toBeNull();
    expect(webhookTarget("https://app.example:8443/hook", ["https://app.example:8443/cb"], false)).toBeNull();
  });

  test("private mode allows local HTTP for development, but still only on a registered origin", () => {
    expect(webhookTarget("http://localhost:3000/hook", ["http://localhost:3000/cb"], true)).not.toBeNull();
    expect(webhookTarget("http://localhost:4000/hook", ["http://localhost:3000/cb"], true)).toBeNull();
    expect(webhookTarget("file:///etc/passwd", ["file:///x"], true)).toBeNull();
  });
});

describe("postWebhook", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function listen(handler: Parameters<typeof createServer>[1]) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`);
  }

  test("sends the body and headers and reports the status", async () => {
    let received: { body: string; signature?: string | string[]; type?: string } | undefined;
    const url = await listen((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received = { body, signature: req.headers["x-omicron-signature"], type: req.headers["content-type"] };
        res.statusCode = 204;
        res.end();
      });
    });
    expect(await postWebhook(url, '{"é":1}', { "x-omicron-signature": "sig" }, true)).toBe(204);
    expect(received).toEqual({ body: '{"é":1}', signature: "sig", type: "application/json" });
  });

  test("does not follow a redirect", async () => {
    let hits = 0;
    const url = await listen((_req, res) => {
      hits++;
      res.writeHead(302, { location: "/elsewhere" });
      res.end();
    });
    expect(await postWebhook(url, "{}", {}, true)).toBe(302);
    expect(hits).toBe(1);
  });

  test("refuses a host name that resolves to a private address", async () => {
    await expect(postWebhook(new URL("https://localhost/hook"), "{}", {}, false)).rejects.toThrow("Non-public host.");
  });
});
