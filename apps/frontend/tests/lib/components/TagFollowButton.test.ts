import TagFollowButton from "$lib/components/TagFollowButton.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { fakeFetch } from "../../fakeFetch";

test("toggles following a tag", async () => {
  const { fetch, calls } = fakeFetch({ "POST /api/tags/c%23/follow": {}, "DELETE /api/tags/c%23/follow": {} });
  vi.stubGlobal("fetch", fetch);
  render(TagFollowButton, { props: { slug: "c#", following: false } });
  await fireEvent.click(screen.getByRole("button", { name: "Follow" }));
  await waitFor(() => screen.getByRole("button", { name: "Following" }));
  await fireEvent.click(screen.getByRole("button"));
  await waitFor(() => screen.getByRole("button", { name: "Follow" }));
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "POST /api/tags/c%23/follow",
    "DELETE /api/tags/c%23/follow",
  ]);
});

test("re-seeds from props when reused on another tag page", async () => {
  const { rerender } = render(TagFollowButton, { props: { slug: "a", following: false } });
  await rerender({ slug: "b", following: true });
  expect(screen.getByRole("button")).toHaveTextContent("Following");
});
