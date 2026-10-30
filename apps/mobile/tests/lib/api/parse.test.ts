import * as c from "@omicron/contract";
import { describe, expect, test, vi } from "vitest";
import { ContractError, parseResponse } from "@/lib/api/parse";
import { makeComment, makePost } from "../../fixtures";

const withoutSaved = (id: string) => {
  const { saved: _gone, ...post } = makePost({ id });
  return post;
};

const row = (id: string, type: string) => ({
  id,
  type,
  actor: null,
  postId: null,
  postTitle: null,
  commentSnippet: null,
  read: false,
  createdAt: "2026-10-01T00:00:00.000Z",
});

describe("parseResponse", () => {
  test("a response that fits comes back as it arrived, without a copy", () => {
    const body = { items: [makePost()], nextCursor: null };
    expect(parseResponse(c.PostPage, body, "/feed")).toBe(body);
  });

  test("leaves out every list item that doesn't fit, and says how many", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = { items: [withoutSaved("x"), makePost({ id: "a" }), withoutSaved("y")], nextCursor: "n" };
    const page = parseResponse(c.PostPage, body, "/feed");
    expect(page.items.map((post) => post.id)).toEqual(["a"]);
    expect(page.nextCursor).toBe("n");
    expect(warn).toHaveBeenCalledWith("/feed: left out 2 item(s) that don't match the API contract");
    // The caller's copy is untouched.
    expect(body.items).toHaveLength(3);
  });

  test("drops the innermost bad element: a broken reply, not its whole thread", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { liked: _gone, ...brokenReply } = makeComment({ id: "r2" });
    const thread = { ...makeComment({ id: "c1" }), replies: [makeComment({ id: "r1" }), brokenReply] };
    const page = parseResponse(c.CommentPage, { items: [thread], nextCursor: null }, "/comments");
    expect(page.items[0].replies.map((reply) => reply.id)).toEqual(["r1"]);
  });

  test("an unknown enum value drops just that row", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = parseResponse(
      c.NotificationPage,
      { items: [row("n1", "like"), row("n2", "poll_ended")], nextCursor: null },
      "/notifications",
    );
    expect(page.items.map((n) => n.id)).toEqual(["n1"]);
  });

  test("a mismatch outside any list is a ContractError with its issues", () => {
    const error = (() => {
      try {
        parseResponse(c.PostResponse, { post: withoutSaved("p") }, "/posts/p");
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ContractError);
    expect(error instanceof ContractError && error.issues[0]?.path).toEqual(["post", "saved"]);
    expect(error instanceof ContractError && error.path).toBe("/posts/p");
  });

  test("a body of the wrong kind altogether is a ContractError", () => {
    expect(() => parseResponse(c.PostPage, null, "/feed")).toThrow(ContractError);
    expect(() => parseResponse(c.PostPage, { items: "nope", nextCursor: null }, "/feed")).toThrow(ContractError);
  });
});
