// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import { render, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import TrafficCollector from "#lib/components/TrafficCollector.svelte";

test("counts initial hydration when SvelteKit's navigation event has no route ID", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.assign(page, { status: 200, route: { id: "/about" } });
  render(TrafficCollector, { props: { enabled: true, staff: false } });
  vi.mocked(afterNavigate).mock.calls[0][0]({
    from: null,
    to: { url: new URL("https://blog.test/about"), route: { id: null } },
  } as never);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
});

const navigate = () =>
  vi
    .mocked(afterNavigate)
    .mock.calls[0][0]({ from: null, to: { url: new URL("https://blog.test/"), route: { id: "/" } } } as never);
test("does not collect when a browser has requested Do Not Track", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
  page.status = 200;
  render(TrafficCollector, { props: { enabled: true, staff: false } });
  navigate();
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  Object.defineProperty(navigator, "doNotTrack", { value: undefined, configurable: true });
});
test("cookieless collection still respects Global Privacy Control", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
  try {
    page.status = 200;
    render(TrafficCollector, { props: { enabled: true, staff: false } });
    navigate();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: undefined, configurable: true });
  }
});
test("a background tab is measured only when it becomes visible, and cleanup removes its listener", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  page.status = 200;
  const { unmount } = render(TrafficCollector, { props: { enabled: true, staff: false } });
  navigate();
  expect(fetch).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  unmount();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(fetch).toHaveBeenCalledOnce();
});
