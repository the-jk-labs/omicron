import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import TagPage from "../../../../src/routes/tags/[tag]/+page.svelte";
import { apiError, fakeFetch } from "../../../fakeFetch";
import { post } from "../../../fixtures";

let api: ReturnType<typeof fakeFetch>;
function setup(
  o: { postCount?: number; followerCount?: number; items?: Post[]; cursor?: string | null; user?: unknown } = {},
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  api = fakeFetch({ "*": apiError(404), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(TagPage, {
    props: {
      data: {
        user: o.user ?? null,
        detail: {
          tag: { slug: "deno", name: "Deno" },
          postCount: o.postCount ?? 2,
          followerCount: o.followerCount ?? 1,
          isFollowing: false,
        },
        page: { items: o.items ?? [post()], nextCursor: o.cursor ?? null },
      } as never,
    },
  });
}

const stats = () => document.querySelector("header .mt-2")!.textContent.replace(/\s+/g, " ").trim();

test("names the tag with pluralized counts", () => {
  setup();
  expect(screen.getByRole("heading", { level: 1, name: "#Deno" })).toBeInTheDocument();
  expect(stats()).toBe("2 articles 1 follower");
});

test("singular articles, plural followers", () => {
  setup({ postCount: 1, followerCount: 0 });
  expect(stats()).toBe("1 article 0 followers");
});

test("only signed-in readers can follow the tag", () => {
  const { unmount } = setup();
  expect(screen.queryByRole("button", { name: /Follow/ })).toBe(null);
  unmount();
  setup({ user: { id: "u1" } });
  expect(screen.getByRole("button", { name: /Follow/ })).toBeInTheDocument();
});

test("an unused tag says so", () => {
  setup({ items: [] });
  expect(screen.getByText("No articles tagged #Deno yet.")).toBeInTheDocument();
});

test("Show more pages through the tag by its slug", async () => {
  setup(
    { cursor: "c1" },
    { "GET /api/tags/deno/posts": { items: [post({ id: "p2", title: "More Deno" })], nextCursor: null } },
  );
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("More Deno");
  expect(api.calls[0].path).toMatch(/^\/api\/tags\/deno\/posts\?cursor=c1/);
});
