// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/moderation.ts"));

import { config } from "@/config.ts";
import { reportRoutes } from "@/routes/reports.ts";
import * as moderation from "@/services/moderation.ts";

const api = mount("/api/reports", reportRoutes);
const UUID = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";
// Each test reports from its own address so the hourly limiter never carries over.
let ip = 0;
const from = () => ({ "x-forwarded-for": `10.0.0.${++ip}` });

test("requires a signed-in user", async () => {
  api.signOut();
  expect((await api.json("/api/reports", "POST", { subjectType: "post", subjectId: UUID }, from())).status).toBe(401);
});

test("files a report and answers 201", async () => {
  api.signIn();
  vi.mocked(moderation.report).mockResolvedValue();
  const res = await api.json("/api/reports", "POST", { subjectType: "user", subjectId: UUID, reason: "spam" }, from());
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ ok: true });
  expect(moderation.report).toHaveBeenCalledWith("me", { subjectType: "user", subjectId: UUID, reason: "spam" });
});

test.for([
  [{ subjectType: "comment", subjectId: UUID }, "unknown subject type"],
  [{ subjectType: "post", subjectId: "%" }, "a non-UUID id (no LIKE wildcard ever reaches the post lookup)"],
  [{ subjectType: "post" }, "a missing id"],
  [{ subjectType: "post", subjectId: UUID, reason: "x".repeat(1001) }, "an over-long reason"],
])("rejects %o (%s)", async ([body]) => {
  api.signIn();
  expect((await api.json("/api/reports", "POST", body, from())).status).toBe(400);
  expect(moderation.report).not.toHaveBeenCalled();
});

test("is rate-limited per address", async () => {
  api.signIn();
  vi.mocked(moderation.report).mockResolvedValue();
  const headers = from();
  for (let i = 0; i < config.RL_REGISTER_MAX; i++) {
    expect((await api.json("/api/reports", "POST", { subjectType: "post", subjectId: UUID }, headers)).status).toBe(
      201,
    );
  }
  expect((await api.json("/api/reports", "POST", { subjectType: "post", subjectId: UUID }, headers)).status).toBe(429);
});
