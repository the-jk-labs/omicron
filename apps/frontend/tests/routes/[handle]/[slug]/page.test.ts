import { goto } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import type { Post, User } from "#lib/types.js";
import PostPage from "../../../../src/routes/[handle]/[slug]/+page.svelte";
import { apiError, fakeFetch } from "../../../fakeFetch";
import { post } from "../../../fixtures";

const POST_ID = post().id;
const author = {
  id: "author-1",
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  isAdmin: false,
  isModerator: false,
} as User;
const reader = {
  id: "reader-1",
  username: "bob",
  displayName: "Bob",
  avatarUrl: null,
  isAdmin: false,
  isModerator: false,
} as User;
const moderator = {
  id: "mod-1",
  username: "mo",
  displayName: "Mo",
  avatarUrl: null,
  isAdmin: false,
  isModerator: true,
} as User;

let api: ReturnType<typeof fakeFetch>;
function setup(
  p: Partial<Post> & Record<string, unknown> = {},
  user: User | null = reader,
  extra: Record<string, unknown> = {},
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  api = fakeFetch({ "*": apiError(404), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(PostPage, {
    props: {
      data: {
        post: post(p as Partial<Post>),
        user,
        comments: { items: [], nextCursor: null },
        related: [],
        ...extra,
      } as never,
    },
  });
}

const writeText = vi.fn<(s: string) => Promise<void>>();
beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

async function openMenu() {
  await fireEvent.keyDown(screen.getByRole("button", { name: "Post options" }), { key: "Enter" });
  await screen.findByRole("menu");
}
const menuItems = () => screen.queryAllByRole("menuitem").map((i) => i.textContent?.trim());

async function answerConfirm(result: { ok: boolean; notify?: boolean }) {
  await waitFor(() => expect(get(confirmRequest)).not.toBe(null));
  const req = get(confirmRequest)!;
  req.resolve({ notify: false, ...result });
  confirmRequest.set(null);
  return req;
}

test("shows the title, author, read time and language", () => {
  setup({ language: "de" });
  expect(screen.getByRole("heading", { level: 1, name: "Hello world" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Ada/ })[0]).toHaveAttribute("href", "/@ada");
  expect(screen.getByText(/min read/)).toBeInTheDocument();
  expect(screen.getByText("German")).toBeInTheDocument();
});

test("a federated post names its origin instance", () => {
  setup({ remote: true, author: { id: "r1", username: "zed@social.example", displayName: "Zed", avatarUrl: null } });
  expect(screen.getByText("social.example")).toBeInTheDocument();
});

test("an untitled post has no heading", () => {
  setup({ title: null });
  expect(screen.queryByRole("heading", { level: 1 })).toBe(null);
});

test("code blocks get a copy button that copies the code and flashes a check", async () => {
  vi.useFakeTimers();
  try {
    setup({
      contentHtml:
        '<pre><code>const x = 1;</code></pre><figure class="code-figure"><figcaption class="code-title">a.ts</figcaption><pre><code>let y;</code></pre></figure>',
    });
    const buttons = screen.getAllByRole("button", { name: "Copy code" });
    expect(buttons).toHaveLength(2);
    // A captioned block hosts its button in the caption, not the <pre>.
    expect(buttons[1].parentElement).toHaveClass("code-title");
    expect(buttons[0].parentElement).toHaveClass("code-block");
    await fireEvent.click(buttons[0]);
    await vi.waitFor(() => expect(buttons[0]).toHaveClass("copied"));
    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    await vi.advanceTimersByTimeAsync(1600);
    expect(buttons[0]).not.toHaveClass("copied");
  } finally {
    vi.useRealTimers();
  }
});

test("a blocked clipboard leaves the copy button alone", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  setup({ contentHtml: "<pre><code>x</code></pre>" });
  const btn = screen.getByRole("button", { name: "Copy code" });
  await fireEvent.click(btn);
  await Promise.resolve();
  expect(btn).not.toHaveClass("copied");
});

test("liking while signed out goes to the login page", async () => {
  setup({}, null);
  await fireEvent.click(screen.getByRole("button", { name: "Like (0 likes)" }));
  expect(goto).toHaveBeenCalledWith("/login");
  expect(api.calls).toHaveLength(0);
});

test("liking is optimistic and settles on the server's count", async () => {
  setup({ likeCount: 4 }, reader, {}, { [`POST /api/posts/${POST_ID}/like`]: { liked: true, likeCount: 9 } });
  await fireEvent.click(screen.getByRole("button", { name: /^Like/ }));
  expect(screen.getByRole("button", { name: /^Unlike/ })).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("button", { name: "Unlike (9 likes)" });
});

test("a failed unlike restores the like", async () => {
  setup({ liked: true, likeCount: 3 }, reader, {}, { [`DELETE /api/posts/${POST_ID}/like`]: apiError(500) });
  await fireEvent.click(screen.getByRole("button", { name: /^Unlike/ }));
  await screen.findByRole("button", { name: "Unlike (3 likes)" });
  expect(api.calls.at(-1)?.method).toBe("DELETE");
});

test("the author's menu edits, unpublishes and deletes, but can't report", async () => {
  setup({ status: "published" }, author);
  await openMenu();
  expect(menuItems()).toEqual(["Share", "Edit", "Move to drafts", "Delete"]);
});

test("a reader can only share and report; a signed-out visitor only share", async () => {
  const { unmount } = setup({}, reader);
  await openMenu();
  expect(menuItems()).toEqual(["Share", "Report"]);
  unmount();
  setup({}, null);
  await openMenu();
  expect(menuItems()).toEqual(["Share"]);
});

test("nobody edits or deletes a federated post locally", async () => {
  setup(
    { remote: true, author: { id: "author-1", username: "ada@far.example", displayName: "Ada", avatarUrl: null } },
    author,
  );
  await openMenu();
  expect(menuItems()).toEqual(["Share"]);
});

test("the author deletes without a notify option and goes home", async () => {
  setup({}, author, {}, { [`DELETE /api/posts/${POST_ID}`]: { ok: true } });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  const req = await answerConfirm({ ok: true });
  expect(req.notify).toBeUndefined();
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(api.calls.at(-1)?.path).toBe(`/api/posts/${POST_ID}`);
});

test("a moderator's delete can notify the author", async () => {
  setup({}, moderator, {}, { [`DELETE /api/posts/${POST_ID}`]: { ok: true } });
  await openMenu();
  expect(menuItems()).toContain("Report");
  await fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  const req = await answerConfirm({ ok: true, notify: true });
  expect(req.notify?.label).toBe("Notify the author by email.");
  await waitFor(() => expect(api.calls.at(-1)?.path).toBe(`/api/posts/${POST_ID}?notify=true`));
});

test("a cancelled delete does nothing; a failed one is shown", async () => {
  setup({}, author, {}, { [`DELETE /api/posts/${POST_ID}`]: apiError(403, "Not yours") });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await answerConfirm({ ok: false });
  expect(api.calls).toHaveLength(0);
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await answerConfirm({ ok: true });
  await screen.findByText("Not yours");
  expect(goto).not.toHaveBeenCalled();
});

test("moving to drafts unpublishes and opens the drafts tab", async () => {
  setup({ status: "published" }, author, {}, { [`PATCH /api/posts/${POST_ID}`]: post() });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Move to drafts" }));
  await answerConfirm({ ok: true });
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/manage?tab=draft"));
  expect(api.calls.at(-1)?.body).toEqual({ status: "draft" });
});

test("a failed unpublish is shown", async () => {
  setup({ status: "published" }, author, {}, { [`PATCH /api/posts/${POST_ID}`]: apiError(500, "Unpublish broke") });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Move to drafts" }));
  await answerConfirm({ ok: true });
  await screen.findByText("Unpublish broke");
});

test("reporting sends the trimmed reason, thanks the reader, then closes", async () => {
  setup({}, reader, {}, { "POST /api/reports": { ok: true } });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
  await fireEvent.input(await screen.findByLabelText("Reason"), { target: { value: "  spam  " } });
  await fireEvent.click(screen.getByRole("button", { name: /Report|Submit/ }));
  await waitFor(() =>
    expect(api.calls.at(-1)?.body).toEqual({ subjectType: "post", subjectId: POST_ID, reason: "spam" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null), { timeout: 3000 });
});

test("a blank reason is omitted and a failed report is shown", async () => {
  setup({}, reader, {}, { "POST /api/reports": apiError(429, "Slow down") });
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
  await screen.findByLabelText("Reason");
  await fireEvent.click(screen.getByRole("button", { name: /Report|Submit/ }));
  await screen.findByText("Slow down");
  expect(api.calls.at(-1)?.body).toEqual({ subjectType: "post", subjectId: POST_ID });
});

test("share copies the link when there is no native share sheet", async () => {
  setup();
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Share" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(location.href));
  await openMenu();
  expect(menuItems()[0]).toBe("Link copied");
});

test("share prefers the native sheet", async () => {
  const share = vi.fn<(d: ShareData) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  setup();
  await openMenu();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Share" }));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Hello world", url: location.href }));
  expect(writeText).not.toHaveBeenCalled();
});

test("an explicit cover renders with its credit, and hides if it fails to load", async () => {
  setup({
    coverUrl: "https://img.example/c.jpg",
    coverCredit: {
      name: "Jo",
      nameUrl: "https://u.example/jo",
      source: "Unsplash",
      sourceUrl: "https://u.example",
      license: "CC0",
      licenseUrl: "https://cc.example",
    },
  });
  const img = document.querySelector<HTMLImageElement>('img[src="https://img.example/c.jpg"]')!;
  expect(img).not.toBe(null);
  expect(screen.getByRole("link", { name: "Jo" })).toHaveAttribute("href", "https://u.example/jo");
  expect(screen.getByRole("link", { name: "CC0" })).toHaveAttribute("href", "https://cc.example");
  await fireEvent.error(img);
  expect(document.querySelector('img[src="https://img.example/c.jpg"]')).toBe(null);
});

test("a bannerUrl alone doesn't render a hero", () => {
  setup({ bannerUrl: "https://img.example/body.jpg" });
  expect(document.querySelector('img[src="https://img.example/body.jpg"]')).toBe(null);
});

test("related posts are listed under Read next", () => {
  setup({}, reader, { related: [post({ id: "p2", title: "Another one", slug: "another-one" })] });
  expect(screen.getByRole("heading", { name: /Read next|More/ })).toBeInTheDocument();
  expect(screen.getByText("Another one")).toBeInTheDocument();
});

test("the cover credit keeps a space before the licence", () => {
  setup({
    coverUrl: "https://img.example/c.jpg",
    coverCredit: {
      name: "Jo",
      nameUrl: "https://u.example/jo",
      source: "Unsplash",
      sourceUrl: "https://u.example",
      license: "CC0",
      licenseUrl: "https://cc.example",
    },
  });
  expect(screen.getByText(/Photo by/).textContent?.replace(/\s+/g, " ")).toContain("Unsplash · CC0");
});
