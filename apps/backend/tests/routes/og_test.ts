// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/ogCard.ts"));
vi.mock(import("@/services/profileCard.ts"));
vi.mock(import("@/services/instanceSetup.ts"));

import { notFound } from "@/lib/http.ts";
import { ogRoutes } from "@/routes/og.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { postCard } from "@/services/ogCard.ts";
import { profileCard } from "@/services/profileCard.ts";

const api = mount("/api/og", ogRoutes);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff]);

beforeEach(() => {
  vi.mocked(getOrigin).mockResolvedValue("https://blog.example");
});

describe("post cards", () => {
  test("serves a JPEG cached for a day", async () => {
    vi.mocked(postCard).mockResolvedValue(JPEG);
    const res = await api.request("/api/og/posts/0b0e7c4e.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(postCard).toHaveBeenCalledWith("0b0e7c4e");
  });

  test("falls back to the brand image when no card can be drawn", async () => {
    vi.mocked(postCard).mockResolvedValue(null);
    const res = await api.request("/api/og/posts/0b0e7c4e.jpg");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://blog.example/og-image.png");
  });

  test.for(["abc.jpg", "0b0e7c4e.png", "%25.jpg", "zzzzzzzz.jpg"])("refuses %s before the service", async (file) => {
    expect((await api.request(`/api/og/posts/${file}`)).status).toBe(404);
    expect(postCard).not.toHaveBeenCalled();
  });

  test("a post the public cannot see is a 404", async () => {
    vi.mocked(postCard).mockRejectedValue(notFound("Post not found."));
    expect((await api.request("/api/og/posts/0b0e7c4e.jpg")).status).toBe(404);
  });
});

describe("profile cards", () => {
  test("serves a JPEG for a valid username", async () => {
    vi.mocked(profileCard).mockResolvedValue(JPEG);
    expect((await api.request("/api/og/profiles/ada_l.jpg")).status).toBe(200);
    expect(profileCard).toHaveBeenCalledWith("ada_l");
  });

  test("falls back to the brand image", async () => {
    vi.mocked(profileCard).mockResolvedValue(null);
    expect((await api.request("/api/og/profiles/ada.jpg")).headers.get("location")).toBe(
      "https://blog.example/og-image.png",
    );
  });

  test.for(["Ada.jpg", "ab.jpg", "a-b.jpg", `${"a".repeat(31)}.jpg`, "ada.png"])("refuses %s", async (file) => {
    expect((await api.request(`/api/og/profiles/${file}`)).status).toBe(404);
    expect(profileCard).not.toHaveBeenCalled();
  });
});
