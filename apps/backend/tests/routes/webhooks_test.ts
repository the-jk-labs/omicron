// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/webhooks.ts"));
vi.mock(import("@/services/webhookTokens.ts"));

import { config } from "@/config.ts";
import { unauthorized } from "@/lib/http.ts";
import { webhookRoutes } from "@/routes/webhooks.ts";
import * as webhooks from "@/services/webhooks.ts";
import * as webhookTokens from "@/services/webhookTokens.ts";

const api = mount("/api/webhooks", webhookRoutes);
let ip = 0;
const from = (h: Record<string, string> = {}) => ({ "x-forwarded-for": `192.0.2.${++ip % 250}`, ...h });
const author = userRow({ id: "author" });

beforeEach(() => {
  api.signOut();
  vi.mocked(webhooks.authenticate).mockResolvedValue(author);
  vi.mocked(webhooks.ingestContent).mockResolvedValue({ id: "p1", slug: "doc", status: "published", created: true });
});

describe("POST /content", () => {
  test("a new document is a 201 with the ingest result", async () => {
    const res = await api.json("/api/webhooks/content", "POST", { title: "T", body: "B", slug: "doc" }, from());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "p1", slug: "doc", status: "published", created: true });
    expect(webhooks.ingestContent).toHaveBeenCalledWith({ title: "T", body: "B", slug: "doc" }, author);
  });

  test("an update is a 200", async () => {
    vi.mocked(webhooks.ingestContent).mockResolvedValue({ id: "p1", slug: "doc", status: "draft", created: false });
    expect((await api.json("/api/webhooks/content", "POST", { slug: "doc", status: "draft" }, from())).status).toBe(
      200,
    );
  });

  test("authentication happens before the body is read", async () => {
    vi.mocked(webhooks.authenticate).mockRejectedValue(unauthorized("Invalid webhook credentials."));
    const res = await api.request("/api/webhooks/content", {
      method: "POST",
      headers: from(),
      body: "this is not even JSON",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid webhook credentials." });
  });

  test("a body that is not JSON is a 400", async () => {
    const res = await api.request("/api/webhooks/content", { method: "POST", headers: from(), body: "{oops" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body must be valid JSON." });
  });

  test("an invalid payload names the field without echoing it", async () => {
    const res = await api.json("/api/webhooks/content", "POST", { title: "", body: "B" }, from());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("title");
    expect(webhooks.ingestContent).not.toHaveBeenCalled();
  });

  test("a body over the cap is a 413 even without a Content-Length", async () => {
    const big = JSON.stringify({ title: "T", body: "x".repeat(config.WEBHOOK_MAX_BODY_BYTES) });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const res = await api.request("/api/webhooks/content", {
      method: "POST",
      headers: from(),
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
    expect(webhooks.ingestContent).not.toHaveBeenCalled();
  });

  test("is rate-limited per address", async () => {
    const headers = from();
    for (let i = 0; i < config.RL_WEBHOOK_MAX; i++) {
      await api.json("/api/webhooks/content", "POST", { slug: "d" }, headers);
    }
    expect((await api.json("/api/webhooks/content", "POST", { slug: "d" }, headers)).status).toBe(429);
  });
});

describe("tokens", () => {
  const row = {
    id: "t1",
    userId: "me",
    label: "CMS",
    tokenHash: "secret-hash",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  test.for([
    ["GET", "/api/webhooks/tokens"],
    ["POST", "/api/webhooks/tokens"],
    ["DELETE", "/api/webhooks/tokens/t1"],
  ])("%s %s requires a signed-in user", async ([method, path]) => {
    expect((await api.request(path, { method })).status).toBe(401);
  });

  test("list never exposes the hash", async () => {
    api.signIn();
    vi.mocked(webhookTokens.list).mockResolvedValue([row]);
    const body = await (await api.request("/api/webhooks/tokens")).json();
    expect(body.tokens).toEqual([{ id: "t1", label: "CMS", lastUsedAt: null, createdAt: "2026-01-01T00:00:00.000Z" }]);
    expect(JSON.stringify(body)).not.toContain("secret-hash");
  });

  test("minting returns the plaintext once, with a 201", async () => {
    api.signIn();
    vi.mocked(webhookTokens.mint).mockResolvedValue({ token: "omi_wh_abc", row });
    const res = await api.json("/api/webhooks/tokens", "POST", { label: "CMS" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBe("omi_wh_abc");
    expect(body.tokenInfo).not.toHaveProperty("tokenHash");
    expect(webhookTokens.mint).toHaveBeenCalledWith("me", "CMS");
  });

  test("minting tolerates an empty body (the service asks for a label)", async () => {
    api.signIn();
    vi.mocked(webhookTokens.mint).mockResolvedValue({ token: "omi_wh_abc", row });
    await api.json("/api/webhooks/tokens", "POST", {});
    expect(webhookTokens.mint).toHaveBeenCalledWith("me", undefined);
  });

  test("revoke", async () => {
    api.signIn();
    vi.mocked(webhookTokens.revoke).mockResolvedValue();
    expect(await (await api.request("/api/webhooks/tokens/t1", { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(webhookTokens.revoke).toHaveBeenCalledWith("me", "t1");
  });
});
