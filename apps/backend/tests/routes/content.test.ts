// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/contentPortability.ts"));
import { MAX_ARCHIVE_BYTES } from "@/lib/contentArchive.ts";
import { contentRoutes } from "@/routes/content.ts";
import * as service from "@/services/contentPortability.ts";

const api = mount("/api/content", contentRoutes);
let account = 0;
beforeEach(() => {
  api.signIn({ id: `content-${++account}` });
  vi.mocked(service.preview).mockResolvedValue({ format: "omicron", items: [], imageCount: 0, warnings: [] });
  vi.mocked(service.importContent).mockResolvedValue({ imported: 1, skipped: 0, failed: [] });
  vi.mocked(service.exportContent).mockResolvedValue(new Uint8Array([80, 75]));
});

test.for([
  ["GET", "export"],
  ["POST", "preview"],
  ["POST", "import"],
])("%s %s requires authentication", async ([method, path]) => {
  api.signOut();
  expect((await api.request(`/api/content/${path}`, { method })).status).toBe(401);
  expect(service.exportContent).not.toHaveBeenCalled();
  expect(service.preview).not.toHaveBeenCalled();
  expect(service.importContent).not.toHaveBeenCalled();
});

test("downloads a private, non-cacheable ZIP attachment", async () => {
  const response = await api.request("/api/content/export");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/zip");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([80, 75]));
  expect(service.exportContent).toHaveBeenCalledWith(api.session.user);
});

test("preview reads raw bytes and scopes the service to the authenticated account", async () => {
  const response = await api.request("/api/content/preview", { method: "POST", body: "raw archive" });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(service.preview).toHaveBeenCalledWith(api.session.user!.id, new TextEncoder().encode("raw archive"));
});

test("published restoration is opt-in and malformed options are rejected", async () => {
  await api.request("/api/content/import", { method: "POST", body: "raw" });
  await api.request("/api/content/import?preservePublished=true", { method: "POST", body: "raw" });
  expect(vi.mocked(service.importContent).mock.calls.map((call) => call[2])).toEqual([false, true]);
  expect((await api.request("/api/content/import?preservePublished=yes", { method: "POST", body: "raw" })).status).toBe(
    400,
  );
  expect(service.importContent).toHaveBeenCalledTimes(2);
});

test("caps declared and chunked uploads before invoking parsers", async () => {
  const declared = await api.request("/api/content/preview", {
    method: "POST",
    body: "tiny",
    headers: { "content-length": String(MAX_ARCHIVE_BYTES + 1) },
  });
  expect(declared.status).toBe(400);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_ARCHIVE_BYTES + 1));
      controller.close();
    },
  });
  const response = await api.request("/api/content/preview", { method: "POST", body, duplex: "half" } as RequestInit);
  expect(response.status).toBe(400);
  expect(service.preview).not.toHaveBeenCalled();
});

test("limits expensive operations per account", async () => {
  for (let i = 0; i < 6; i++) expect((await api.request("/api/content/export")).status).toBe(200);
  expect((await api.request("/api/content/export")).status).toBe(429);
  expect(service.exportContent).toHaveBeenCalledTimes(6);
});
