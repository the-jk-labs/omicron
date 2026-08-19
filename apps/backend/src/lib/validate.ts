// SPDX-License-Identifier: AGPL-3.0-or-later
// Request-body validation for the JSON API.
//
// Wraps @hono/zod-validator so a rejected body comes back in this app's own
// error shape. zValidator's default handler answers with its own JSON
// (`{ success: false, error: … }`), which the frontend client cannot read — it
// looks for `body.error` as a string (apps/frontend/src/lib/api/client.ts) and
// would otherwise show "Request failed (400)" instead of the reason. Throwing
// `badRequest` instead routes through `handleError`, so every validation
// failure looks exactly like every other 400 the API returns.
import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { badRequest } from "@/lib/http.ts";

// Structural, not `z.ZodError`: the validator hands back zod v4's core error
// type (`$ZodError`), which lacks the classic class's helper methods. Only
// `issues` is read here, so matching on that keeps the two compatible.
type IssueBearing = { issues: ReadonlyArray<{ message: string; path: PropertyKey[] }> };

// The first issue only. A form posts one bad field at a time in practice, and
// the client renders a single message — a joined list of every issue reads
// worse than the first one stated plainly.
function firstIssue(error: IssueBearing): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body.";
  // `path` is empty when the whole body is the wrong shape (e.g. not an object),
  // in which case the bare message is already the clearest thing to say.
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// Validates the JSON body against `schema`, exposing the parsed value to the
// handler as `c.req.valid("json")` — typed, so the handler and the service it
// calls agree on the shape without a cast.
//
// `message` replaces the derived text with a fixed one. The admin endpoints use
// it to keep the "Expected { … }" wording their UI already shows, which states
// the whole expected shape — more useful to an API caller than a single field's
// complaint, and not something to change silently while moving where the
// validation happens.
export function jsonBody<T extends z.ZodType>(schema: T, message?: string) {
  return zValidator("json", schema, (result) => {
    if (!result.success) throw badRequest(message ?? firstIssue(result.error));
  });
}
