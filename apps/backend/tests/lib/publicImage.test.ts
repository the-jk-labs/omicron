// SPDX-License-Identifier: AGPL-3.0-or-later
import { Buffer } from "node:buffer";
import { lookup, type LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import { request } from "node:https";
import { PassThrough } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";
import {
  fetchPublicImage,
  imageTarget,
  isPublicImageAddress,
  MAX_PROXY_IMAGE_BYTES,
  publicImageLookup,
} from "@/lib/publicImage.ts";

vi.mock("node:dns", () => ({ lookup: vi.fn<typeof lookup>() }));
vi.mock("node:https", () => ({ request: vi.fn<typeof request>() }));

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
type Reply = { status?: number; headers?: Record<string, string | undefined>; chunks?: Buffer[] };
let replies: Reply[];

function dnsReplies(records: LookupAddress[], error: Error | null = null) {
  vi.mocked(lookup).mockImplementation((...args: unknown[]) => {
    const callback = args[2] as (error: Error | null, records: LookupAddress[]) => void;
    callback(error, records);
  });
}

beforeEach(() => {
  replies = [{ headers: { "content-type": "image/png", "set-cookie": "tracking=1" }, chunks: [PNG] }];
  vi.mocked(request).mockImplementation(((_url: URL, _options: unknown, callback: (response: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    req.destroy = (error) => {
      req.emit("error", error);
    };
    req.end = () => {
      const reply = replies.shift()!;
      const response = Object.assign(new PassThrough(), {
        statusCode: reply.status ?? 200,
        headers: reply.headers ?? {},
      });
      callback(response);
      if (!response.destroyed) {
        for (const chunk of reply.chunks ?? []) response.write(chunk);
        response.end();
      }
    };
    return req;
  }) as never);
});

test.for([
  "https://localhost/a",
  "https://backend/a",
  "https://sub.localhost./a",
  "https://host.internal/a",
  "https://127.0.0.1/a",
  "https://2130706433/a",
  "https://0x7f000001/a",
  "https://10.0.0.1/a",
  "https://169.254.169.254/a",
  "https://[::ffff:7f00:1]/a",
  "https://[fc00::1]/a",
  "https://[64:ff9b::7f00:1]/a",
  "https://[2001:db8::1]/a",
  "https://[2001:20::1]/a",
  "https://[3fff::1]/a",
  "https://user:pass@images.example/a",
  "file:///etc/passwd",
  "data:image/png,hello",
  "https://images.example:8443/a",
  "https://images.example/api/media/proxy?url=anything",
  "not a url",
])("rejects a non-public or unsupported target without making a request: %s", async (input) => {
  await expect(fetchPublicImage(input)).rejects.toThrow(/Invalid (?:image )?URL/);
  expect(request).not.toHaveBeenCalled();
});

test("upgrades legacy HTTP sources, stripping fragments", () => {
  expect(imageTarget("http://images.example/a.png#fragment").href).toBe("https://images.example/a.png");
});

test("fetches a signature-checked raster without any visitor credentials or headers", async () => {
  expect(await fetchPublicImage("https://images.example/a.png")).toEqual({ bytes: PNG, contentType: "image/png" });
  expect(vi.mocked(request).mock.calls[0][1]).toMatchObject({ agent: false, lookup: publicImageLookup });
  expect(vi.mocked(request).mock.calls[0][1]).toHaveProperty("headers", {
    accept: "image/png, image/jpeg, image/gif, image/webp",
    "accept-encoding": "identity",
  });
});

test("every redirect is checked again; internal destinations are never fetched", async () => {
  replies = [{ status: 302, headers: { location: "https://127.0.0.1/private" } }];
  await expect(fetchPublicImage("https://images.example/a")).rejects.toThrow("Invalid image URL");
  expect(request).toHaveBeenCalledTimes(1);
});

test("relative redirects preserve the pinned transport and the shared deadline", async () => {
  replies.unshift({ status: 302, headers: { location: "/next.png" } });
  await fetchPublicImage("https://images.example/a");
  expect(vi.mocked(request).mock.calls[1][0].toString()).toBe("https://images.example/next.png");
  expect(vi.mocked(request).mock.calls[1][1]).toHaveProperty("signal", vi.mocked(request).mock.calls[0][1].signal);
});

test.for([
  { headers: { "content-type": "image/svg+xml" }, chunks: [Buffer.from("<svg/>")] },
  { headers: { "content-type": "image/png" }, chunks: [Buffer.from("<html>not an image</html>")] },
  { headers: { "content-type": "image/png", "content-length": String(MAX_PROXY_IMAGE_BYTES + 1) } },
  { headers: { "content-type": "image/png" }, chunks: [Buffer.alloc(MAX_PROXY_IMAGE_BYTES), PNG] },
  { headers: { "content-type": "image/png", "content-encoding": "gzip" } },
  { status: 404, headers: { "content-type": "image/png" }, chunks: [PNG] },
])("refuses active content, wrong signatures, oversized streams, encodings and errors", async (reply) => {
  replies = [reply];
  await expect(fetchPublicImage("https://images.example/a")).rejects.toThrow(
    /Unsupported image response|Invalid image contents|Image too large/,
  );
});

test("redirect loops stop after four requests", async () => {
  replies = Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/loop" } }));
  await expect(fetchPublicImage("https://images.example/a")).rejects.toThrow("Too many image redirects");
  expect(request).toHaveBeenCalledTimes(4);
});

test("mixed public/private DNS answers fail closed, even with private federation enabled", async () => {
  vi.stubEnv("ALLOW_PRIVATE_FEDERATION", "true");
  vi.resetModules();
  const { publicImageLookup: privateLookup } = await import("@/lib/publicImage.ts");
  const { config } = await import("@/config.ts");
  expect(config.ALLOW_PRIVATE_FEDERATION).toBe(true);
  dnsReplies([
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  const callback = vi.fn<Parameters<typeof publicImageLookup>[2]>();
  privateLookup("images.example", {}, callback);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(expect.any(Error), "", 0));
});

test("hands the already-validated DNS answer to the socket", async () => {
  dnsReplies([{ address: "8.8.8.8", family: 4 }]);
  const callback = vi.fn<Parameters<typeof publicImageLookup>[2]>();
  publicImageLookup("images.example", {}, callback);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4));
  expect(lookup).toHaveBeenCalledExactlyOnceWith("images.example", { all: true }, expect.any(Function));
});

test.for(["empty", "invalid", "error"])("DNS fails closed on an %s answer", (kind) => {
  dnsReplies(
    kind === "invalid" ? [{ address: "invalid", family: 4 }] : [],
    kind === "error" ? new Error("lookup failed") : null,
  );
  const callback = vi.fn<Parameters<typeof publicImageLookup>[2]>();
  publicImageLookup("images.example", { all: true }, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "", 0);
});

test("the multi-address socket lookup returns only validated records", () => {
  const records = [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ];
  dnsReplies(records);
  const callback = vi.fn<Parameters<typeof publicImageLookup>[2]>();
  publicImageLookup("images.example", { all: true }, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(null, records);
});

test("non-public addresses fail closed", () => {
  for (const address of ["invalid", "0.0.0.0", "192.168.1.1", "::1", "fe80::1", "2002:7f00:1::", "ff02::1"]) {
    expect(isPublicImageAddress(address)).toBe(false);
  }
  expect(isPublicImageAddress("2606:4700:4700::1111")).toBe(true);
});
