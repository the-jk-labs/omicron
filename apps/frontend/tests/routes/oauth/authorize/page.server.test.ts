// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { actions, load } from "../../../../src/routes/oauth/authorize/+page.server";
import { fakeFetch } from "../../../fakeFetch";

const consent = {
  ticket: "ticket",
  name: "Directory",
  callbackOrigin: "https://client.example",
  username: "ada",
  scope: "read:accounts",
};
function loadEvent(response: Response = Response.json(consent)) {
  const { fetch, calls } = fakeFetch({ "GET /api/oauth/authorize": response });
  const setHeaders = vi.fn();
  return {
    event: { fetch, url: new URL("https://omicron.example/oauth/authorize?client_id=c&state=x"), setHeaders } as never,
    calls,
    setHeaders,
  };
}
test("loads fresh consent with no caching or referrer leakage", async () => {
  const { event, calls, setHeaders } = loadEvent();
  expect(await load(event)).toEqual({ consent });
  expect(calls[0].path).toBe("/api/oauth/authorize?client_id=c&state=x");
  expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "no-store", "referrer-policy": "no-referrer" });
});
test("signed-out users resume this request after login", async () => {
  const { event } = loadEvent(Response.json({ error: "Sign in" }, { status: 401 }));
  await expect(load(event)).rejects.toMatchObject({
    status: 303,
    location: "/login?returnTo=%2Foauth%2Fauthorize%3Fclient_id%3Dc%26state%3Dx",
  });
});
test("invalid client or callback fails locally rather than redirecting", async () => {
  const { event } = loadEvent(
    Response.json({ error: "invalid_request", error_description: "Unknown callback." }, { status: 400 }),
  );
  await expect(load(event)).rejects.toMatchObject({ status: 400, body: { message: "Unknown callback." } });
});
test("decisions forward only the ticket and choice, with the real request Origin", async () => {
  const { fetch, calls } = fakeFetch({
    "POST /api/oauth/authorize": { redirect: "https://client.example/cb?code=code&state=x" },
  });
  const body = new FormData();
  body.set("ticket", "ticket");
  body.set("decision", "allow");
  body.set("redirect_uri", "https://evil.example");
  const request = new Request("https://omicron.example/oauth/authorize", {
    method: "POST",
    headers: { origin: "https://omicron.example" },
    body,
  });
  await expect(actions.default({ request, fetch } as never)).rejects.toMatchObject({
    status: 303,
    location: "https://client.example/cb?code=code&state=x",
  });
  expect(calls[0].body).toEqual({ ticket: "ticket", decision: "allow" });
  expect(calls[0].headers.get("origin")).toBe("https://omicron.example");
});
test("expired consent stays on the page with a useful error", async () => {
  const { fetch } = fakeFetch({
    "POST /api/oauth/authorize": Response.json({ error_description: "Start again." }, { status: 400 }),
  });
  const request = new Request("https://omicron.example/oauth/authorize", { method: "POST", body: new FormData() });
  const result = await actions.default({ request, fetch } as never);
  expect(result).toMatchObject({ status: 400, data: { error: "Start again." } });
});

test("approved native callbacks are returned to the OS rather than fetched by the server", async () => {
  const { fetch } = fakeFetch({
    "POST /api/oauth/authorize": { redirect: "org.example.reader:/oauth/callback?code=code&state=x" },
  });
  const form = new FormData();
  form.set("ticket", "ticket");
  form.set("decision", "allow");
  const request = new Request("https://omicron.example/oauth/authorize", {
    method: "POST",
    headers: { origin: "https://omicron.example" },
    body: form,
  });
  await expect(actions.default({ request, fetch } as never)).rejects.toMatchObject({
    status: 303,
    location: "org.example.reader:/oauth/callback?code=code&state=x",
  });
});
