import * as c from "@omicron/contract";
import { describe, expect, test, vi } from "vitest";
import { ApiError, createApiClient, type Fetcher } from "@/lib/api/client";
import { ContractError } from "@/lib/api/parse";
import { makePost } from "../../fixtures";
import { jsonResponse } from "../../support/http";

const ORIGIN = "https://blog.test";

function client(response: Response | (() => Promise<Response>), cookie = "omicron.session_token=abc") {
  const fetch = vi.fn<Fetcher>(async () => (typeof response === "function" ? response() : response));
  return { fetch, api: createApiClient({ origin: ORIGIN, getCookie: () => cookie, fetch }) };
}

describe("createApiClient", () => {
  test("sends the session cookie and the instance origin, never the native cookie jar", async () => {
    const { fetch, api } = client(jsonResponse({ user: null }));
    await api.get("/me", c.MeResponse);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://blog.test/api/me");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: { cookie: "omicron.session_token=abc", origin: ORIGIN, accept: "application/json" },
    });
  });

  test("signed out: no cookie header at all", async () => {
    const { fetch, api } = client(jsonResponse({ items: [], nextCursor: null }), "");
    await api.get("/posts", c.PostPage);
    expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("cookie");
  });

  test("JSON bodies are serialized with a JSON content type", async () => {
    const { fetch, api } = client(jsonResponse({ ok: true }));
    await api.post("/posts/1/comments", c.Ok, { content: "hi" });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: '{"content":"hi"}',
      headers: { "content-type": "application/json" },
    });
  });

  test("raw uploads keep their own content type", async () => {
    const { fetch, api } = client(jsonResponse({ url: "/api/uploads/a.webp" }, 201));
    const bytes = new ArrayBuffer(4);
    await api.postRaw("/uploads", c.UploadedImage, bytes, "image/webp");
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: bytes, headers: { "content-type": "image/webp" } });
  });

  test("API errors carry status, message and field", async () => {
    const { api } = client(jsonResponse({ error: "Title is too long", field: "title" }, 400));
    await expect(api.patch("/posts/1", c.SavedPostResponse, {})).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Title is too long",
      field: "title",
    });
  });

  test("429 exposes Retry-After", async () => {
    const { api } = client(jsonResponse({ error: "Slow down" }, 429, { "retry-after": "30" }));
    const error = await api.get("/feed", c.PostPage).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof ApiError && error.retryAfter).toBe(30);
  });

  test("a proxy's HTML error page still fails as an ApiError with its status", async () => {
    const { api } = client(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    await expect(api.get("/feed", c.PostPage)).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
  });

  test("a 200 that isn't JSON is an error, not silent garbage", async () => {
    const { api } = client(new Response("<html>login</html>", { status: 200 }));
    await expect(api.get("/me", c.MeResponse)).rejects.toMatchObject({
      status: 200,
      message: "Unexpected response from the server.",
    });
  });

  test("an empty success body where the contract expects one is a ContractError", async () => {
    const { api } = client(new Response("", { status: 200 }));
    await expect(api.del("/lists/1", c.Ok)).rejects.toBeInstanceOf(ContractError);
  });

  test("a field the contract doesn't name passes through, ignored", async () => {
    const { api } = client(jsonResponse({ post: { ...makePost(), futureField: 1 } }));
    const { post } = await api.get("/posts/1", c.PostResponse);
    expect(post).toMatchObject(makePost());
  });

  test("a response missing a field the contract requires is a ContractError", async () => {
    const { saved: _gone, ...broken } = makePost();
    const { api } = client(jsonResponse({ post: broken }));
    await expect(api.get("/posts/1", c.PostResponse)).rejects.toBeInstanceOf(ContractError);
  });

  test("a feed keeps its good posts when one doesn't match the contract", async () => {
    const { saved: _gone, ...broken } = makePost({ id: "bad" });
    const { api } = client(
      jsonResponse({ items: [makePost({ id: "a" }), broken, makePost({ id: "b" })], nextCursor: null }),
    );
    const page = await api.get("/feed", c.PostPage);
    expect(page.items.map((post) => post.id)).toEqual(["a", "b"]);
  });
});
