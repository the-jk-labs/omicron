// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import { render } from "@testing-library/svelte";
import { beforeEach, expect, test, vi, type Mock } from "vitest";
vi.mock(import("#lib/umami.js"));
import SiteStatistics from "#lib/components/SiteStatistics.svelte";
import { createUmamiTracker } from "#lib/umami.js";

const ID = "94db1cb1-74f4-4a40-ad6c-962362670409";
type Tracker = ReturnType<typeof createUmamiTracker>;
let track: Mock<Tracker["track"]>;
let destroy: Mock<Tracker["destroy"]>;

beforeEach(() => {
  track = vi.fn<Tracker["track"]>().mockResolvedValue(undefined);
  destroy = vi.fn<Tracker["destroy"]>();
  vi.mocked(createUmamiTracker).mockReturnValue({ track, destroy });
  Object.assign(page, { url: new URL("https://blog.example/@ada/article"), status: 200, data: {} });
});

const navigate = (from: string | null = null) =>
  vi
    .mocked(afterNavigate)
    .mock.calls.at(-1)![0]({
      from: from ? { url: new URL(from) } : null,
    } as never);

test("registers one navigation hook, using document.referrer for direct arrivals and the prior URL for SPA navigation", () => {
  const view = render(SiteStatistics, { props: { websiteId: ID } });
  navigate();
  expect(track).toHaveBeenLastCalledWith(ID, page.url, document.referrer, true);
  navigate("https://blog.example/tags/writing?filter=1");
  expect(track).toHaveBeenLastCalledWith(ID, page.url, "https://blog.example/tags/writing?filter=1", true);
  expect(createUmamiTracker).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(destroy).toHaveBeenCalledOnce();
});

test.for(["draft", "scheduled", "error"])("%s pages cannot be sent to Umami", (state) => {
  Object.assign(page, state === "error" ? { status: 404 } : { data: { post: { status: state } } });
  render(SiteStatistics, { props: { websiteId: ID } });
  navigate();
  expect(track).toHaveBeenLastCalledWith(ID, page.url, document.referrer, false);
});
