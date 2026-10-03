// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import StockPhotoPicker from "#lib/components/StockPhotoPicker.svelte";
import type { StockPhoto } from "#lib/types.js";
import { apiError, fakeFetch } from "../../fakeFetch";

function photo(id: string, o: Partial<StockPhoto> = {}): StockPhoto {
  return {
    id,
    alt: `Photo ${id}`,
    thumbUrl: `https://img.example/${id}-t.jpg`,
    bannerUrl: `https://img.example/${id}.jpg`,
    credit: {
      name: `Author ${id}`,
      nameUrl: `https://img.example/@${id}`,
      source: "Openverse",
      sourceUrl: "https://openverse.org",
      license: "CC BY",
      licenseUrl: "https://cc.example",
    },
    useToken: null,
    ...o,
  };
}

let api: ReturnType<typeof fakeFetch>;
function setup(routes: Parameters<typeof fakeFetch>[0] = {}, providers = ["openverse"]) {
  api = fakeFetch({
    "GET /api/photos/providers": { providers },
    "GET /api/photos/search": (req) => {
      const u = new URL(req.url);
      const p = u.searchParams.get("provider")!;
      return Response.json({ items: [photo(`${p}-${u.searchParams.get("q")}`)] });
    },
    "POST /api/photos/use": { ok: true },
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const onPick = vi.fn<(p: StockPhoto) => void>();
  const r = render(StockPhotoPicker, { props: { open: true, onPick } });
  return { ...r, onPick };
}

const searches = () => api.calls.filter((c) => c.path.startsWith("/api/photos/search")).map((c) => c.path);
async function search(q: string) {
  await fireEvent.input(screen.getByRole("textbox", { name: "Search photos" }), { target: { value: q } });
  await fireEvent.submit(screen.getByRole("textbox", { name: "Search photos" }).closest("form")!);
}

test("starts with a hint, searches on submit, and credits each creator", async () => {
  setup();
  expect(screen.getByText(/Search for a photo you're free to publish/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  await search("  mountains ");
  const img = await screen.findByRole("img", { name: "Photo openverse-mountains" });
  expect(img).toHaveAttribute("src", "https://img.example/openverse-mountains-t.jpg");
  expect(screen.getByRole("link", { name: "Author openverse-mountains" })).toHaveAttribute(
    "rel",
    "noopener noreferrer nofollow",
  );
  expect(screen.getByText("· CC BY")).toBeInTheDocument();
  expect(searches()).toEqual(["/api/photos/search?provider=openverse&q=mountains&page=1"]);
});

test("no results and failures read differently", async () => {
  let n = 0;
  setup({
    "GET /api/photos/search": () => (++n === 1 ? Response.json({ items: [] }) : apiError(502, "Openverse is down")),
  });
  await search("zzz");
  await screen.findByText("No photos matched that search.");
  await search("again");
  await screen.findByText("Openverse is down");
});

test("with only Openverse there are no provider tabs", async () => {
  setup();
  await waitFor(() => expect(api.calls.some((c) => c.path === "/api/photos/providers")).toBe(true));
  expect(screen.queryByRole("tab")).toBe(null);
});

test("switching provider re-runs the current search there", async () => {
  setup({}, ["openverse", "unsplash"]);
  await search("desk");
  await screen.findByRole("img", { name: "Photo openverse-desk" });
  const tab = await screen.findByRole("tab", { name: "Unsplash" });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
  await screen.findByRole("img", { name: "Photo unsplash-desk" });
  expect(searches().at(-1)).toBe("/api/photos/search?provider=unsplash&q=desk&page=1");
});

test("picking hands the photo back, pings the provider's use counter and closes", async () => {
  const { onPick } = setup({
    "GET /api/photos/search": { items: [photo("u1", { useToken: "tok-1" })] },
  });
  await search("coffee");
  await fireEvent.click((await screen.findByRole("img", { name: "Photo u1" })).closest("button")!);
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === "/api/photos/use")?.body).toEqual({
      provider: "openverse",
      token: "tok-1",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("a photo without a use token sends no ping", async () => {
  setup();
  await search("sea");
  await fireEvent.click((await screen.findByRole("img", { name: "Photo openverse-sea" })).closest("button")!);
  expect(api.calls.some((c) => c.path === "/api/photos/use")).toBe(false);
});

test("closing clears the search so the next open starts clean", async () => {
  const { rerender } = setup();
  await search("sea");
  await screen.findByRole("img", { name: "Photo openverse-sea" });
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await rerender({ open: true });
  expect(screen.getByRole("textbox", { name: "Search photos" })).toHaveValue("");
  expect(screen.queryByRole("img")).toBe(null);
});

test("after picking, the next open starts clean", async () => {
  const { rerender } = setup();
  await search("sea");
  await fireEvent.click((await screen.findByRole("img", { name: "Photo openverse-sea" })).closest("button")!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  await rerender({ open: true });
  expect(screen.getByRole("textbox", { name: "Search photos" })).toHaveValue("");
});

test("switching provider mid-search shows the new provider's photos", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  setup(
    {
      "GET /api/photos/search": async (req) => {
        const p = new URL(req.url).searchParams.get("provider")!;
        if (p === "openverse") await gate;
        return Response.json({ items: [photo(`${p}-x`)] });
      },
    },
    ["openverse", "unsplash"],
  );
  await search("x");
  const tab = await screen.findByRole("tab", { name: "Unsplash" });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
  release();
  await screen.findByRole("img");
  expect(screen.getByRole("img", { name: "Photo unsplash-x" })).toBeInTheDocument();
});
