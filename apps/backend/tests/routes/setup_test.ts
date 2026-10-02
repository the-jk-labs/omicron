// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/auth/auth.ts"), () => ({
  auth: { api: { signUpEmail: vi.fn<(...args: unknown[]) => Promise<Response>>() } } as never,
}));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/email.ts"));
vi.mock(import("@/services/emailSettings.ts"));
vi.mock(import("@/services/instanceSetup.ts"));

import { auth } from "@/auth/auth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { instanceRoutes, setupRoutes } from "@/routes/setup.ts";
import { sendTestEmail } from "@/services/email.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import * as setup from "@/services/instanceSetup.ts";

const instance = mount("/api/instance", instanceRoutes);
const wizard = mount("/api/setup", setupRoutes);

const valid = {
  appName: "My Blog",
  appDomain: "blog.example",
  admin: { username: "Root", email: "root@blog.example", password: "Long-enough-password-1" },
};

beforeEach(() => {
  vi.mocked(setup.isSetupComplete).mockResolvedValue(false);
  vi.mocked(auth.api.signUpEmail).mockResolvedValue(
    new Response("{}", {
      status: 200,
      headers: [
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "other=1"],
      ],
    }) as never,
  );
  vi.mocked(usersRepo.findByUsername).mockResolvedValue(
    userRow({ id: "root", username: "root", email: "root@blog.example" }),
  );
  vi.mocked(emailSettings.resolveCandidate).mockResolvedValue({ mode: "smtp" } as never);
});

describe("/api/instance", () => {
  test("public info", async () => {
    vi.mocked(setup.publicInfo).mockResolvedValue({ name: "My Blog" } as never);
    expect(await (await instance.request("/api/instance")).json()).toEqual({ name: "My Blog" });
  });

  test("the TLS ask endpoint answers ok or 403 for Caddy", async () => {
    vi.mocked(setup.isTlsDomainAllowed).mockResolvedValue(true);
    const ok = await instance.request("/api/instance/tls-check?domain=blog.example");
    expect([ok.status, await ok.text()]).toEqual([200, "ok"]);
    vi.mocked(setup.isTlsDomainAllowed).mockResolvedValue(false);
    expect((await instance.request("/api/instance/tls-check")).status).toBe(403);
    expect(setup.isTlsDomainAllowed).toHaveBeenLastCalledWith("");
  });
});

describe("POST /api/setup", () => {
  test("creates the admin, forwards every session cookie and saves the instance", async () => {
    const res = await wizard.json("/api/setup", "POST", valid);
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(["session=abc; Path=/", "other=1"]);
    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: { email: "root@blog.example", password: valid.admin.password, name: "Root", username: "Root" },
      asResponse: true,
    });
    expect(setup.completeSetup).toHaveBeenCalledWith({
      appName: "My Blog",
      appDomain: "blog.example",
      email: undefined,
    });
    expect(usersRepo.findByUsername).toHaveBeenCalledWith("root");
    const body = await res.json();
    expect(body.user).toMatchObject({ id: "root", email: "root@blog.example" });
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  test("uses the display name when one is given", async () => {
    await wizard.json("/api/setup", "POST", { ...valid, admin: { ...valid.admin, displayName: "The Root" } });
    expect(vi.mocked(auth.api.signUpEmail).mock.calls[0][0]).toMatchObject({ body: { name: "The Root" } });
  });

  test("refuses once the instance is set up, before touching anything", async () => {
    vi.mocked(setup.isSetupComplete).mockResolvedValue(true);
    const res = await wizard.json("/api/setup", "POST", valid);
    expect(res.status).toBe(409);
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(setup.completeSetup).not.toHaveBeenCalled();
  });

  test.for([
    [{ ...valid, appName: "   " }, "An instance name is required."],
    [{ ...valid, admin: { ...valid.admin, email: "nope" } }, "A valid admin email is required."],
    [{ ...valid, email: { mode: "pigeon" } }, expect.any(String)],
    [{ ...valid, email: { smtp: { port: 70000 } } }, expect.any(String)],
  ])("a bad body is a 400 naming the first problem (%#)", async ([body, message]) => {
    const res = await wizard.json("/api/setup", "POST", body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual(message);
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  test("a body that is not JSON is a 400", async () => {
    const res = await wizard.request("/api/setup", { method: "POST", body: "nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input: expected object, received null" });
  });

  test("a failed sign-up surfaces Better Auth's message and saves nothing", async () => {
    vi.mocked(auth.api.signUpEmail).mockResolvedValue(
      new Response(JSON.stringify({ message: "Password is too short" }), { status: 400 }) as never,
    );
    const res = await wizard.json("/api/setup", "POST", valid);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Password is too short" });
    expect(setup.completeSetup).not.toHaveBeenCalled();
  });

  test("a failed sign-up without a message gets a generic one", async () => {
    vi.mocked(auth.api.signUpEmail).mockResolvedValue(new Response("oops", { status: 500 }) as never);
    expect(await (await wizard.json("/api/setup", "POST", valid)).json()).toEqual({
      error: "Could not create the admin account.",
    });
  });
});

describe("POST /api/setup/test-email", () => {
  test("sends a test with the unsaved settings", async () => {
    vi.mocked(sendTestEmail).mockResolvedValue();
    const res = await wizard.json("/api/setup/test-email", "POST", { to: "me@x.test", email: { mode: "smtp" } });
    expect(await res.json()).toEqual({ ok: true });
    expect(emailSettings.resolveCandidate).toHaveBeenCalledWith({ mode: "smtp" });
    expect(sendTestEmail).toHaveBeenCalledWith("me@x.test", { mode: "smtp" });
  });

  test("a transport failure is a 400 with the reason", async () => {
    vi.mocked(sendTestEmail).mockRejectedValue(new Error("Connection refused"));
    const res = await wizard.json("/api/setup/test-email", "POST", { to: "me@x.test" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Could not send the test email: Connection refused" });
  });

  test("refuses once the instance is set up", async () => {
    vi.mocked(setup.isSetupComplete).mockResolvedValue(true);
    expect((await wizard.json("/api/setup/test-email", "POST", { to: "me@x.test" })).status).toBe(409);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  test("validates the recipient", async () => {
    const res = await wizard.json("/api/setup/test-email", "POST", { to: "not-an-email" });
    expect(await res.json()).toEqual({ error: "A valid recipient address is required." });
  });
});
