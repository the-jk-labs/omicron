import { beforeNavigate, goto, replaceState } from "$app/navigation";
import { confirmRequest } from "$lib/components/ui/confirm";
import { reading } from "$lib/prefs.svelte";
import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import ComposePage from "../../../src/routes/compose/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";
import { post } from "../../fixtures";

vi.mock(
  import("$lib/editor/Editor.svelte"),
  async () =>
    ({
      default: (await import("../../mocks/EditorStub.svelte")).default,
    }) as never,
);

afterEach(() => {
  vi.useRealTimers();
});

let api: ReturnType<typeof fakeFetch>;
function setup(draft: Partial<Post> | null = null, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    "POST /api/posts": { post: { id: "new-1", slug: null } },
    "PATCH /api/posts/d1": { post: { id: "d1" } },
    "*": apiError(404),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(ComposePage, { props: { data: { draft: draft ? post({ id: "d1", ...draft }) : null } as never } });
}

const writes = () => api.calls.filter((c) => c.method === "POST" || c.method === "PATCH");
const title = () => screen.getByPlaceholderText("Title");
const typeTitle = (v: string) => fireEvent.input(title(), { target: { value: v } });
const typeBody = async (v: string) =>
  fireEvent.input(await screen.findByRole("textbox", { name: "Body" }), { target: { value: v } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

async function publishingMenu(item: string) {
  await fireEvent.keyDown(screen.getByRole("button", { name: "Publishing options" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

test("a new post starts as a draft in the remembered language, editor loaded lazily", async () => {
  vi.spyOn(reading, "composeLang", "get").mockReturnValue("de");
  setup();
  expect(screen.getByText("Draft")).toBeInTheDocument();
  expect(screen.getByText("German")).toBeInTheDocument();
  await screen.findByRole("textbox", { name: "Body" });
  await click("Publish");
  expect(screen.getByText("A blog post must have a title.")).toBeInTheDocument();
});

test("publishing needs a title and a body", async () => {
  setup();
  await typeTitle("Hello");
  await click("Publish");
  expect(screen.getByText("Write something first.")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});

test("publishing a new post creates it, remembers its language and opens it", async () => {
  const setLang = vi.spyOn(reading, "setComposeLang");
  setup();
  await typeTitle("  Hello  ");
  await typeBody("Body text");
  await click("Publish");
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/new-1"));
  expect(writes().at(-1)).toMatchObject({
    method: "POST",
    body: {
      title: "Hello",
      contentHtml: "<p>Body text</p>",
      status: "published",
      publishAt: null,
      summary: null,
      tags: [],
    },
  });
  expect(setLang).toHaveBeenCalled();
});

test("saving an empty new post is refused", async () => {
  setup();
  await click("Save draft");
  expect(screen.getByText("Nothing to save yet.")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});

test("Save draft creates the draft and goes to the drafts tab", async () => {
  setup();
  await typeTitle("Half an idea");
  await click("Save draft");
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/manage?tab=draft"));
  expect(writes()).toHaveLength(1);
  expect(writes()[0]!.body).toMatchObject({ title: "Half an idea", status: "draft", publishAt: null });
});

test("a reopened draft is seeded and saved in place", async () => {
  setup({ title: "Old title", tags: [{ slug: "deno", name: "deno" }], summary: "Sum", contentHtml: "<p>Old</p>" });
  expect(title()).toHaveValue("Old title");
  expect(screen.getByRole("button", { name: "Remove tag deno" })).toBeInTheDocument();
  await typeBody("New body");
  await click("Publish");
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/d1"));
  expect(writes()).toHaveLength(1);
  expect(writes()[0]).toMatchObject({
    method: "PATCH",
    path: "/api/posts/d1",
    body: { title: "Old title", summary: "Sum", tags: ["deno"], status: "published" },
  });
});

test("scheduling sends the chosen moment and goes to the scheduled tab", async () => {
  setup();
  await typeTitle("Later");
  await typeBody("Soon");
  await publishingMenu("Schedule…");
  await fireEvent.click(await screen.findByRole("button", { name: "Schedule" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/manage?tab=scheduled"));
  const body = writes().at(-1)!.body as { status: string; publishAt: string };
  expect(body.status).toBe("scheduled");
  expect(new Date(body.publishAt).getTime()).toBeGreaterThan(Date.now());
});

test("a scheduled post shows when it goes out and offers Publish now", () => {
  setup({ status: "scheduled", publishAt: "2099-01-01T09:00:00Z" } as Partial<Post>);
  expect(screen.getByText(/^Scheduled ·/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish now" })).toBeInTheDocument();
});

test("unscheduling an edited scheduled post saves it as a draft", async () => {
  setup({ status: "scheduled", publishAt: "2099-01-01T09:00:00Z" } as Partial<Post>);
  await typeTitle("Edited");
  await publishingMenu("Unschedule, keep as draft");
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/posts/manage?tab=draft"));
  expect(writes().at(-1)?.body).toMatchObject({ status: "draft", publishAt: null });
});

// BUG: persist("draft") refuses when !hasContent(), and hasContent() is false
// until the author has edited something (`touched`). So opening a scheduled
// post and choosing "Unschedule, keep as draft" answers "Nothing to save yet."
// and the post stays scheduled to go out.
test.fails("BUG: an untouched scheduled post can be unscheduled", async () => {
  setup({ status: "scheduled", publishAt: "2099-01-01T09:00:00Z" } as Partial<Post>);
  await publishingMenu("Unschedule, keep as draft");
  await waitFor(() => expect(writes().at(-1)?.body).toMatchObject({ status: "draft", publishAt: null }), {
    timeout: 500,
  });
});

test("a failed publish keeps the editor open with the reason", async () => {
  setup(null, { "POST /api/posts": apiError(422, "Title too long") });
  await typeTitle("T");
  await typeBody("B");
  await click("Publish");
  await screen.findByText("Title too long");
  expect(goto).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
});

test("autosave creates the draft once, puts its id in the URL, then updates it", async () => {
  vi.useFakeTimers();
  setup(null, { "PATCH /api/posts/new-1": { post: { id: "new-1" } } });
  await typeTitle("Autosaved");
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.waitFor(() => expect(replaceState).toHaveBeenCalledWith("/compose?id=new-1", {}));
  await typeTitle("Autosaved again");
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes().map((c) => c.method)).toEqual(["POST", "PATCH"]);
  // Autosave never publishes: the create says draft, the update says nothing.
  expect(writes()[0]!.body).toMatchObject({ status: "draft" });
  expect(writes()[1]!.body).not.toHaveProperty("status");
});

test("closing the tab with an unsaved change asks the browser to confirm", async () => {
  setup();
  await typeTitle("Unsaved");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

test("an untouched composer lets the tab close", () => {
  setup({ title: "Opened only" });
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

type Nav = { willUnload: boolean; to: { url: URL } | null; cancel: () => void };
const navGuard = () => vi.mocked(beforeNavigate).mock.calls[0]![0] as unknown as (nav: Nav) => Promise<void>;

test("leaving with a pending change saves it first, then continues", async () => {
  setup();
  await typeTitle("Pending");
  const cancel = vi.fn();
  await navGuard()({ willUnload: false, to: { url: new URL("http://localhost/settings") }, cancel });
  expect(cancel).toHaveBeenCalled();
  expect(writes()).toHaveLength(1);
  expect(goto).toHaveBeenCalledWith(new URL("http://localhost/settings"));
});

test("if that save fails, the author chooses whether to leave", async () => {
  setup(null, { "POST /api/posts": apiError(500) });
  await typeTitle("Pending");
  const leaving = navGuard()({ willUnload: false, to: { url: new URL("http://localhost/") }, cancel: vi.fn() });
  await waitFor(() => expect(get(confirmRequest)?.title).toBe("Leave without saving?"));
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  confirmRequest.set(null);
  await leaving;
  expect(goto).not.toHaveBeenCalled();
});

test("navigating away with nothing pending isn't intercepted", async () => {
  setup();
  const cancel = vi.fn();
  await navGuard()({ willUnload: false, to: { url: new URL("http://localhost/") }, cancel });
  expect(cancel).not.toHaveBeenCalled();
});
