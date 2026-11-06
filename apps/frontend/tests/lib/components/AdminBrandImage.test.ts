// SPDX-License-Identifier: AGPL-3.0-or-later
import { refreshAll } from "$app/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import AdminBrandImage from "#lib/components/AdminBrandImage.svelte";
import { apiError, fakeFetch, type Routes } from "../../fakeFetch";

vi.mock(import("#lib/editor/image.js"), async (original) => ({
  ...(await original()),
  prepareImage: async (file: File) => ({ blob: file, type: "image/webp" }),
}));

const props = { kind: "logo", label: "Logo", hint: "Shown in the header." } as const;
const snapshot = (logoUrl: string | null, faviconUrl: string | null = null) => ({ logoUrl, faviconUrl });

function setup(routes: Routes, url: string | null = null) {
  const api = fakeFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  render(AdminBrandImage, { props: { ...props, url } });
  return api;
}

const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText("Choose logo file"), { target: { files: [file] } });
const png = () => new File(["x"], "logo.png", { type: "image/png" });

beforeEach(() => {
  vi.mocked(refreshAll).mockClear();
});

test("the built-in logo has nothing to reset", () => {
  setup({});
  expect(screen.queryByRole("button", { name: "Reset logo to default" })).toBe(null);
});

test("uploading saves at once, shows it, and refreshes the page's logo", async () => {
  const { calls } = setup({ "POST /api/admin/instance/logo": snapshot("/api/uploads/new.webp") });
  await choose(png());
  await screen.findByRole("button", { name: "Reset logo to default" });
  expect(calls.some((call) => call.method === "POST" && call.path === "/api/admin/instance/logo")).toBe(true);
  expect(document.querySelector("img")?.getAttribute("src")).toBe("/api/uploads/new.webp");
  expect(refreshAll).toHaveBeenCalledOnce();
});

test("the favicon goes to its own endpoint and reads its own field", async () => {
  const api = fakeFetch({
    "POST /api/admin/instance/favicon": snapshot("/api/uploads/logo.webp", "/api/uploads/f.webp"),
  });
  vi.stubGlobal("fetch", api.fetch);
  render(AdminBrandImage, { props: { ...props, kind: "favicon", label: "Favicon" } });
  await fireEvent.change(screen.getByLabelText("Choose favicon file"), { target: { files: [png()] } });
  await waitFor(() => expect(document.querySelector("img")?.getAttribute("src")).toBe("/api/uploads/f.webp"));
});

test("resetting goes back to the built-in logo", async () => {
  setup({ "DELETE /api/admin/instance/logo": snapshot(null) }, "/api/uploads/old.webp");
  await fireEvent.click(screen.getByRole("button", { name: "Reset logo to default" }));
  await waitFor(() => expect(document.querySelector("img")).toBe(null));
});

test("a file that isn't an image never reaches the server", async () => {
  const { calls } = setup({});
  await choose(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
  expect(screen.getByRole("alert").textContent).toContain("Unsupported image type");
  expect(calls).toHaveLength(0);
});

test("a failed upload says why and keeps the current logo", async () => {
  setup({ "POST /api/admin/instance/logo": () => apiError(413, "Image too large") }, "/api/uploads/old.webp");
  await choose(png());
  expect((await screen.findByRole("alert")).textContent).toContain("Image too large");
  expect(document.querySelector("img")?.getAttribute("src")).toBe("/api/uploads/old.webp");
});
