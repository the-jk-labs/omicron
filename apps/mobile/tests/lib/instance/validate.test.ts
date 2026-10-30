import { describe, expect, test } from "vitest";
import { InstanceError, validateInstance } from "@/lib/instance/validate";
import { jsonResponse, routeFetch } from "../../support/http";

const ORIGIN = "https://blog.test";
const INFO = { name: "Test Blog", domain: "blog.test", setupComplete: true, emailEnabled: true };

describe("validateInstance", () => {
  test("an Omicron instance on API v1 returns its identity", async () => {
    const fetch = routeFetch({
      "/api/client": () => jsonResponse({ apiVersion: 1 }),
      "/api/instance": () => jsonResponse(INFO),
    });
    await expect(validateInstance(ORIGIN, fetch)).resolves.toMatchObject({ name: "Test Blog" });
    expect(fetch).toHaveBeenCalledWith(
      "https://blog.test/api/client",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  test.each([
    [
      "an unknown API version",
      { "/api/client": () => jsonResponse({ apiVersion: 2 }), "/api/instance": () => jsonResponse(INFO) },
      "not-omicron",
    ],
    [
      "a site without the client endpoint",
      { "/api/client": () => new Response("Not found", { status: 404 }), "/api/instance": () => jsonResponse(INFO) },
      "not-omicron",
    ],
    [
      "an HTML page",
      { "/api/client": () => new Response("<html>", { status: 200 }), "/api/instance": () => jsonResponse(INFO) },
      "not-omicron",
    ],
    [
      "a server error",
      { "/api/client": () => new Response("", { status: 503 }), "/api/instance": () => jsonResponse(INFO) },
      "unreachable",
    ],
    ["a network failure", {}, "unreachable"],
    [
      "an instance mid-setup",
      {
        "/api/client": () => jsonResponse({ apiVersion: 1 }),
        "/api/instance": () => jsonResponse({ ...INFO, setupComplete: false }),
      },
      "not-set-up",
    ],
  ])("%s is refused", async (_name, routes, kind) => {
    const error = await validateInstance(ORIGIN, routeFetch(routes)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InstanceError);
    expect(error instanceof InstanceError && error.kind).toBe(kind);
  });
});
