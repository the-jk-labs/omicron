import type { Comment, Page } from "@omicron/contract";
import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";
import { mapComment } from "@/lib/query/comments";
import { makeComment } from "../../fixtures";

// The hooks in this module need an instance; mapComment doesn't.
vi.mock("@/components/instance-provider", () => ({ useApi: vi.fn<() => void>() }));

const pages = (items: Comment[]): InfiniteData<Page<Comment>, string | null> => ({
  pages: [{ items, nextCursor: null }],
  pageParams: [null],
});

describe("mapComment", () => {
  test("updates a top-level comment", () => {
    const comment = makeComment();
    expect(mapComment(pages([comment]), "c1", (c) => ({ ...c, liked: true }))?.pages[0]?.items[0]?.liked).toBe(true);
  });

  test("updates a reply inside its thread, leaving siblings as they were", () => {
    const sibling = makeComment({ id: "r2", parentId: "c1" });
    const thread = makeComment({ replies: [makeComment({ id: "r1", parentId: "c1" }), sibling] });
    const next = mapComment(pages([thread]), "r1", (c) => ({ ...c, content: "Edited" }));
    const replies = next?.pages[0]?.items[0]?.replies;
    expect(replies?.[0]?.content).toBe("Edited");
    expect(replies?.[1]).toBe(sibling);
  });

  test("no cache, no change", () => {
    expect(mapComment(undefined, "c1", (c) => c)).toBeUndefined();
  });
});
