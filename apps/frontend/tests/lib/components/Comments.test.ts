import { goto } from "$app/navigation";
import Comments from "$lib/components/Comments.svelte";
import { confirmRequest } from "$lib/components/ui/confirm";
import type { Comment, User } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
// The comment section (Comments.svelte with its CommentNode rows): posting,
// threads, likes, edits, deletes and paging, against a fake API.
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

const author = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name, avatarUrl: null });
function comment(id: string, by = author("u-bob", "Bob"), overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    content: `comment ${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    author: by,
    parentId: null,
    likeCount: 0,
    liked: false,
    replies: [],
    ...overrides,
  };
}
const me = { id: "u-ada", username: "ada", displayName: "Ada", isAdmin: false, isModerator: false } as User;

function setup(opts: {
  items?: Comment[];
  cursor?: string | null;
  user?: User | null;
  routes?: Parameters<typeof fakeFetch>[0];
}) {
  const f = fakeFetch(opts.routes ?? {});
  vi.stubGlobal("fetch", f.fetch);
  const onCountChange = vi.fn<(d: number) => void>();
  render(Comments, {
    props: {
      postId: "p1",
      initial: { items: opts.items ?? [], nextCursor: opts.cursor ?? null },
      user: opts.user === undefined ? me : opts.user,
      onCountChange,
    },
  });
  return { ...f, onCountChange };
}

test("a guest is invited to sign in and sent there to like or reply", async () => {
  setup({ items: [comment("c1")], user: null });
  expect(screen.queryByPlaceholderText("What are your thoughts?")).toBe(null);
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await fireEvent.click(screen.getByRole("button", { name: /^Like/ }));
  await fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  expect(goto).toHaveBeenCalledTimes(2);
  expect(goto).toHaveBeenCalledWith("/login");
});

test("posting a response puts it on top and bumps the count", async () => {
  const { calls, onCountChange } = setup({
    items: [comment("c1")],
    routes: {
      "POST /api/posts/p1/comments": { comment: comment("new", author("u-ada", "Ada"), { content: "Great" }) },
    },
  });
  const box = screen.getByPlaceholderText("What are your thoughts?");
  const respond = screen.getByRole("button", { name: "Respond" });
  expect(respond).toBeDisabled();
  await fireEvent.input(box, { target: { value: "Great" } });
  await fireEvent.submit(box.closest("form")!);
  await waitFor(() => screen.getByText("Great"));
  expect(calls[0].body).toEqual({ content: "Great" });
  expect(onCountChange).toHaveBeenCalledWith(1);
  expect(box).toHaveValue("");
});

test("a rejected response shows the server's reason", async () => {
  setup({ routes: { "POST /api/posts/p1/comments": apiError(429, "Slow down") } });
  const box = screen.getByPlaceholderText("What are your thoughts?");
  await fireEvent.input(box, { target: { value: "x" } });
  await fireEvent.submit(box.closest("form")!);
  await waitFor(() => screen.getByText("Slow down"));
});

test("a thread folds its replies; replying to a reply mentions its author", async () => {
  const reply = comment("r1", author("u-cy", "Cy"), { parentId: "c1" });
  const { calls, onCountChange } = setup({
    items: [comment("c1", undefined, { replies: [reply] })],
    routes: {
      "POST /api/posts/p1/comments": {
        comment: comment("r2", author("u-ada", "Ada"), { content: "@Cy yes", parentId: "c1" }),
      },
    },
  });
  expect(screen.queryByText("comment r1")).toBe(null);
  await fireEvent.click(screen.getByRole("button", { name: /1 reply/ }));
  expect(screen.getByText("comment r1")).toBeInTheDocument();

  const replyButtons = screen.getAllByRole("button", { name: /^Reply$/ });
  await fireEvent.click(replyButtons[1]);
  const box = screen.getByPlaceholderText("Reply to Cy…");
  expect(box).toHaveValue("@Cy ");
  await fireEvent.input(box, { target: { value: "@Cy yes" } });
  await fireEvent.submit(box.closest("form")!);
  await waitFor(() => screen.getByText("@Cy yes"));
  expect(calls[0].body).toEqual({ content: "@Cy yes", parentId: "r1" });
  expect(onCountChange).toHaveBeenCalledWith(1);
  expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
});

test("liking is optimistic and settles on the server's numbers; a failure reverts", async () => {
  setup({
    items: [comment("c1"), comment("c2")],
    routes: {
      "POST /api/posts/p1/comments/c1/like": { liked: true, likeCount: 5 },
      "POST /api/posts/p1/comments/c2/like": apiError(500),
    },
  });
  const [like1, like2] = screen.getAllByRole("button", { name: /^Like/ });
  await fireEvent.click(like1);
  await waitFor(() => screen.getByRole("button", { name: "Unlike (5 likes)" }));
  await fireEvent.click(like2);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Like (0 likes)" })).toHaveLength(1));
});

test("only the author can edit; an unchanged edit just closes", async () => {
  const { calls } = setup({
    items: [comment("mine", author("u-ada", "Ada")), comment("theirs")],
    routes: { "PATCH /api/posts/p1/comments/mine": { comment: { id: "mine", content: "edited" } } },
  });
  expect(screen.getAllByRole("button", { name: "Edit comment" })).toHaveLength(1);
  await fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  const box = screen.getByPlaceholderText("Edit your comment…");
  await fireEvent.submit(box.closest("form")!);
  expect(calls).toEqual([]);
  expect(screen.queryByPlaceholderText("Edit your comment…")).toBe(null);

  await fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  await fireEvent.input(screen.getByPlaceholderText("Edit your comment…"), { target: { value: "  edited " } });
  await fireEvent.submit(screen.getByPlaceholderText("Edit your comment…").closest("form")!);
  await waitFor(() => screen.getByText("edited"));
  expect(calls[0].body).toEqual({ content: "edited" });
});

test("a moderator may delete anyone's comment, after confirming; the thread's replies go with it", async () => {
  const { onCountChange } = setup({
    user: { ...me, isModerator: true },
    items: [comment("c1", undefined, { replies: [comment("r1", author("u-cy", "Cy"))] })],
    routes: { "DELETE /api/posts/p1/comments/c1": { ok: true } },
  });
  const del = screen.getAllByRole("button", { name: "Delete comment" })[0];
  await fireEvent.click(del);
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(screen.queryByText("comment c1")).toBe(null));
  expect(onCountChange).toHaveBeenCalledWith(-2);
  expect(screen.getByText(/No responses|Be the first|no responses/i)).toBeInTheDocument();
});

test("a regular reader cannot delete someone else's comment", () => {
  setup({ items: [comment("c1")] });
  expect(screen.queryByRole("button", { name: "Delete comment" })).toBe(null);
});

test("more responses load after the current ones", async () => {
  const { calls } = setup({
    items: [comment("c1")],
    cursor: "cur",
    routes: { "GET /api/posts/p1/comments": { items: [comment("c2")], nextCursor: null } },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Show more responses" }));
  await waitFor(() => screen.getByText("comment c2"));
  expect(calls[0].path).toBe("/api/posts/p1/comments?cursor=cur");
  expect(screen.queryByRole("button", { name: "Show more responses" })).toBe(null);
  const text = document.body.textContent!;
  expect(text.indexOf("comment c1")).toBeLessThan(text.indexOf("comment c2"));
});
