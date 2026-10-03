// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/emailChange.ts"));

import { badRequest } from "@/lib/http.ts";
import { emailChangeRoutes } from "@/routes/emailChange.ts";
import * as emailChange from "@/services/emailChange.ts";

const api = mount("/api/email-change", emailChangeRoutes);

test("undo works signed out, since the link goes to the old inbox", async () => {
  api.signOut();
  vi.mocked(emailChange.undoEmailChange).mockResolvedValue("old@x.test");
  const res = await api.json("/api/email-change/undo", "POST", { token: "tok" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ email: "old@x.test" });
  expect(emailChange.undoEmailChange).toHaveBeenCalledWith("tok");
});

test("a missing token is a 400 before the service runs", async () => {
  const res = await api.json("/api/email-change/undo", "POST", {});
  expect(res.status).toBe(400);
  expect(emailChange.undoEmailChange).not.toHaveBeenCalled();
});

test("a refused undo passes the service's reason through", async () => {
  vi.mocked(emailChange.undoEmailChange).mockRejectedValue(badRequest("This link has expired or was already used."));
  const res = await api.json("/api/email-change/undo", "POST", { token: "tok" });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "This link has expired or was already used." });
});
