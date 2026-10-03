// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import FollowedTagsManager from "#lib/components/FollowedTagsManager.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

test("lists followed tags and unfollows one", async () => {
  const { fetch, calls } = fakeFetch({
    "GET /api/tags/following": { tags: [{ slug: "deno", name: "deno", postCount: 3 }] },
    "DELETE /api/tags/deno/follow": {},
  });
  vi.stubGlobal("fetch", fetch);
  render(FollowedTagsManager);
  await waitFor(() => screen.getByRole("button", { name: "Unfollow" }));
  await fireEvent.click(screen.getByRole("button", { name: "Unfollow" }));
  await waitFor(() => screen.getByText(/You don't follow any tags yet/));
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/api/tags/deno/follow" });
});

test("a failed load says so instead of claiming there are no tags", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/tags/following": apiError(500) }).fetch);
  render(FollowedTagsManager);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText(/You don't follow any tags yet/)).toBe(null);
});
