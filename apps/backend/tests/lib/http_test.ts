// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, test, vi } from "vitest";
import {
  badRequest,
  conflict,
  forbidden,
  handleError,
  HttpError,
  notFound,
  payloadTooLarge,
  tooManyRequests,
  unauthorized,
} from "@/lib/http.ts";

describe("error helpers", () => {
  test.for([
    [() => badRequest("bad"), 400, "bad"],
    [() => unauthorized(), 401, "Unauthorized"],
    [() => unauthorized("Sign in"), 401, "Sign in"],
    [() => forbidden(), 403, "Forbidden"],
    [() => notFound(), 404, "Not found"],
    [() => conflict("taken"), 409, "taken"],
    [() => payloadTooLarge("big"), 413, "big"],
    [() => tooManyRequests(), 429, "Too many requests."],
  ] as const)("%# builds an HttpError with the right status and message", ([make, status, message]) => {
    const err = make();
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
  });
});

function appThrowing(err: Error) {
  const app = new Hono();
  app.onError(handleError);
  app.get("/", () => {
    throw err;
  });
  return app;
}

describe("handleError", () => {
  test("maps an HttpError to its status with an { error } body", async () => {
    const res = await appThrowing(conflict("Username taken")).request("/");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Username taken" });
  });

  test("maps Hono's HTTPException to its status in the same shape", async () => {
    const res = await appThrowing(new HTTPException(400, { message: "Malformed JSON in request body" })).request("/");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed JSON in request body" });
  });

  test("hides unexpected errors behind a generic 500 and logs them", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await appThrowing(new Error("db password is hunter2")).request("/");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(error).toHaveBeenCalled();
  });
});
