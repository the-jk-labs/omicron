// SPDX-License-Identifier: AGPL-3.0-or-later
// Uploaded files are served from a real temp UPLOADS_DIR.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/media.ts"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    saveImage: vi.fn<typeof mod.saveImage>(),
  };
});
vi.mock(import("@/services/shareImage.ts"));

import { config } from "@/config.ts";
import { mediaRoutes } from "@/routes/media.ts";
import * as mediaService from "@/services/media.ts";
import * as shareImageService from "@/services/shareImage.ts";

const api = mount("/api/uploads", mediaRoutes);
let tmp: string;
const originalUploads = config.UPLOADS_DIR;

beforeEach(() => {
  api.signOut();
  tmp = mkdtempSync(join(tmpdir(), "omicron-media-route-"));
  config.UPLOADS_DIR = tmp;
});

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

describe("upload", () => {
  test("requires a signed-in user", async () => {
    expect((await api.request("/api/uploads", { method: "POST", body: "x" })).status).toBe(401);
  });

  test("answers 201 with the stored URL", async () => {
    api.signIn();
    vi.mocked(mediaService.saveImage).mockResolvedValue("/api/uploads/x.png");
    const res = await api.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "Image/PNG ; foo=bar" },
      body: new Uint8Array([9, 8, 7]),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ url: "/api/uploads/x.png" });
    expect(mediaService.saveImage).toHaveBeenCalledWith("me", new Uint8Array([9, 8, 7]), "Image/PNG");
  });

  // A backend exposed without the frontend's body limit in front of it must not
  // buffer whatever a client streams at it.
  test("an oversized body is refused once it passes the cap, without reading the rest", async () => {
    api.signIn();
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctl) {
        if (sent >= 50 * chunk.length) return ctl.close();
        sent += chunk.length;
        ctl.enqueue(chunk);
      },
    });
    const res = await api.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Image too large (max 5 MB)." });
    expect(sent).toBeLessThan(10 * chunk.length);
    expect(mediaService.saveImage).not.toHaveBeenCalled();
  });

  test("a declared length over the cap is refused before the body is read", async () => {
    api.signIn();
    const res = await api.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) },
      body: new Uint8Array([1]),
    });
    expect(res.status).toBe(400);
    expect(mediaService.saveImage).not.toHaveBeenCalled();
  });
});

describe("serving uploads", () => {
  test.for([
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.webp", "image/webp"],
    ["a.gif", "image/gif"],
  ])("serves %s as %s, immutable and nosniff", async ([file, type]) => {
    writeFileSync(join(tmp, file), "bytes");
    const res = await api.request(`/api/uploads/${file}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes");
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("a missing file is a 404", async () => {
    expect((await api.request("/api/uploads/missing.png")).status).toBe(404);
  });

  test.for(["evil.svg", "page.html", "a.PNG.html", "..%2F..%2Fetc%2Fpasswd", "..%5Csecret.png", "a.b.png", "a%00.png"])(
    "refuses anything that is not a plain <id>.<image ext>: %s",
    async (file) => {
      writeFileSync(join(tmp, "evil.svg"), "<svg onload=alert(1)>");
      const res = await api.request(`/api/uploads/${file}`);
      expect(res.status).toBe(404);
    },
  );

  test("an upper-case extension is refused (the pattern is case-sensitive)", async () => {
    writeFileSync(join(tmp, "a.PNG"), "bytes");
    const res = await api.request("/api/uploads/a.PNG");
    expect(res.status).toBe(404);
  });
});

describe("share images", () => {
  test("serves the derived JPEG", async () => {
    vi.mocked(shareImageService.shareJpeg).mockResolvedValue(new Uint8Array([0xff, 0xd8]));
    const res = await api.request("/api/uploads/og/abc-123.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(shareImageService.shareJpeg).toHaveBeenCalledWith("abc-123");
  });

  test.for(["abc.png", "a.b.jpg", "..%2Fx.jpg"])("refuses %s", async (file) => {
    expect((await api.request(`/api/uploads/og/${file}`)).status).toBe(404);
    expect(shareImageService.shareJpeg).not.toHaveBeenCalled();
  });

  test("an unknown upload or a failed transcode is a 404, never a 500", async () => {
    vi.mocked(shareImageService.shareJpeg).mockResolvedValue(null);
    expect((await api.request("/api/uploads/og/abc.jpg")).status).toBe(404);
    vi.mocked(shareImageService.shareJpeg).mockRejectedValue(new Error("corrupt image"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await api.request("/api/uploads/og/abc.jpg")).status).toBe(404);
    expect(warn).toHaveBeenCalled();
  });
});

describe("smaller copies (?w=)", () => {
  const ID = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";

  async function storeImage(width: number, height: number) {
    const { ImageMagick, MagickColor, MagickFormat } = await import("@imagemagick/magick-wasm");
    const { initializeMagick } = await import("@/lib/magick.ts");
    await initializeMagick();
    let bytes!: Uint8Array;
    ImageMagick.read(new MagickColor("#3366cc"), width, height, (img) => {
      img.write(MagickFormat.WebP, (b) => (bytes = new Uint8Array(b)));
    });
    writeFileSync(join(tmp, `${ID}.webp`), bytes);
    return bytes;
  }

  test("a large upload comes back resized to the width asked for, as WebP, cached as hard", async () => {
    await storeImage(1600, 900);
    const res = await api.request(`/api/uploads/${ID}.webp?w=300`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const { MagickImageInfo } = await import("@imagemagick/magick-wasm");
    // 300 snaps up to the next served width.
    expect(MagickImageInfo.create(new Uint8Array(await res.arrayBuffer())).width).toBe(384);
    expect(existsSync(join(tmp, "w", "384", `${ID}.webp`))).toBe(true);
  });

  test("an upload already that narrow, or a width that isn't one, gets the original bytes", async () => {
    const original = await storeImage(200, 100);
    for (const query of ["?w=384", "?w=abc", "?w=99999", ""]) {
      const res = await api.request(`/api/uploads/${ID}.webp${query}`);
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(original);
    }
  });

  test("a cached copy never outlives its upload", async () => {
    await storeImage(1600, 900);
    expect((await api.request(`/api/uploads/${ID}.webp?w=256`)).status).toBe(200);
    rmSync(join(tmp, `${ID}.webp`));
    expect((await api.request(`/api/uploads/${ID}.webp?w=256`)).status).toBe(404);
  });
});
