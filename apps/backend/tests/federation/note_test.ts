// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the federated-replies plumbing: the URI scheme shared by the
// Note dispatcher, outbound delivery, and inbox routing must agree, and only
// public-post comments may federate in either direction. The module under test
// pulls in repos (whose postgres pool connects lazily — no DB here) and
// config (Deno env access), so config is mocked; the logic tested is real.
import { Note } from "@fedify/fedify/vocab";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({
  config: { APP_DOMAIN: "omicron.example", ALLOW_PRIVATE_FEDERATION: false },
}));

import {
  commentApUri,
  isCommentFederable,
  noteText,
  parseLocalCommentRef,
  parseLocalPostRef,
  postApUri,
} from "@/federation/note.ts";
import { htmlToText, textToNoteHtml } from "@/lib/html.ts";

const ORIGIN = "https://omicron.example";

describe("commentApUri / parseLocalCommentRef", () => {
  it("round-trips a local comment URI", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const uri = commentApUri(ORIGIN, "alice", id);
    expect(uri).toBe(`${ORIGIN}/users/alice/comments/${id}`);
    expect(parseLocalCommentRef(uri)).toEqual({ identifier: "alice", commentId: id });
  });

  it("rejects foreign paths and garbage", () => {
    expect(parseLocalCommentRef(`${ORIGIN}/posts/abc`)).toBeNull();
    expect(parseLocalCommentRef(`${ORIGIN}/users/alice`)).toBeNull();
    expect(parseLocalCommentRef("https://mastodon.social/users/bob/statuses/123")).toBeNull();
    expect(parseLocalCommentRef("not a url")).toBeNull();
  });
});

describe("postApUri", () => {
  it("uses the canonical id for a cached remote post", () => {
    expect(postApUri(ORIGIN, { id: "x", remote: true, apId: "https://remote.example/posts/1" })).toBe(
      "https://remote.example/posts/1",
    );
  });

  it("derives the local address otherwise", () => {
    expect(postApUri(ORIGIN, { id: "abc", remote: false, apId: null })).toBe(`${ORIGIN}/posts/abc`);
  });
});

describe("parseLocalPostRef", () => {
  it("resolves our derived post address", () => {
    expect(parseLocalPostRef(`${ORIGIN}/posts/52683dce-2d3a-4b1c-9e5f-123456789abc`)).toBe(
      "52683dce-2d3a-4b1c-9e5f-123456789abc",
    );
  });

  it("rejects comment paths and garbage", () => {
    expect(parseLocalPostRef(`${ORIGIN}/users/alice/comments/x`)).toBeNull();
    expect(parseLocalPostRef("not a url")).toBeNull();
  });
});

describe("isCommentFederable", () => {
  const published = { status: "published" as const };
  it("federates public posts only", () => {
    expect(isCommentFederable({ ...published, remote: false }, false)).toBe(true);
    expect(isCommentFederable({ ...published, remote: true }, false)).toBe(true);
  });

  it("keeps drafts, scheduled posts, and private authors' posts local-only", () => {
    expect(isCommentFederable({ status: "draft", remote: false }, false)).toBe(false);
    expect(isCommentFederable({ status: "scheduled", remote: false }, false)).toBe(false);
    expect(isCommentFederable({ ...published, remote: false }, true)).toBe(false);
  });
});

describe("noteText", () => {
  it("flattens Note HTML to plain text", () => {
    const note = new Note({ content: '<p><span><a href="https://x/@bob">@bob</a></span> hello <b>there</b></p>' });
    expect(noteText(note)).toBe("@bob hello there");
  });

  it("is empty for contentless Notes and capped at local max length", () => {
    expect(noteText(new Note({}))).toBe("");
    expect(noteText(new Note({ content: "x".repeat(5000) })).length).toBe(2000);
  });
});

describe("textToNoteHtml", () => {
  it("escapes markup and round-trips through htmlToText", () => {
    const text = "hello <script>alert(1)</script>\nsecond line";
    const html = textToNoteHtml(text);
    expect(html).not.toContain("<script>");
    expect(htmlToText(html)).toBe("hello <script>alert(1)</script>\nsecond line");
  });
});
