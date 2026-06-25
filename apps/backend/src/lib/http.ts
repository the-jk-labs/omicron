// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "hono";

// Thin HTTP helpers so routes stay terse and consistent.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, msg);
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

// Centralized error → JSON response mapping (wired in app.ts via onError).
export function handleError(err: Error, c: Context): Response {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
}
