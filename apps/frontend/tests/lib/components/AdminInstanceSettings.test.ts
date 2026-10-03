// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminInstanceSettings from "#lib/components/AdminInstanceSettings.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const instance = {
  appName: "Blogs",
  appDomain: "blog.example",
  federationEnabled: true,
  federationRunning: true,
  sessionSecretManaged: true,
  bannerText: null,
  bannerImageUrl: null,
};

function setup(over: Partial<typeof instance> = {}, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch({ "GET /api/admin/instance": { ...instance, ...over }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminInstanceSettings);
  return f;
}

test("loads the identity; a localhost default domain shows as empty", async () => {
  setup({ appDomain: "localhost:5173" });
  await waitFor(() => expect(screen.getByPlaceholderText("My Blog")).toHaveValue("Blogs"));
  expect(screen.getByPlaceholderText("blog.example.com")).toHaveValue("");
});

test("saves trimmed values and the federation switch", async () => {
  const { calls } = setup({}, { "PUT /api/admin/instance": { ...instance, appName: "New", federationEnabled: false } });
  await waitFor(() => expect(screen.getByPlaceholderText("My Blog")).toHaveValue("Blogs"));
  await fireEvent.input(screen.getByPlaceholderText("My Blog"), { target: { value: "  New  " } });
  await fireEvent.click(screen.getByRole("switch"));
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => screen.getByText("Saved."));
  expect(calls.at(-1)?.body).toEqual({
    appName: "New",
    appDomain: "blog.example",
    federationEnabled: false,
    bannerText: "",
  });
});

test("a federation change that awaits a restart says so", async () => {
  setup({ federationEnabled: false, federationRunning: true });
  await waitFor(() => screen.getByText(/Saved as off\. Restart to apply/));
});

test("an unsupported banner image is refused before upload", async () => {
  const { calls } = setup();
  await waitFor(() => expect(screen.getByPlaceholderText("My Blog")).toHaveValue("Blogs"));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await fireEvent.change(input, { target: { files: [new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })] } });
  expect(screen.getByText("Unsupported image type. Use PNG, JPEG, WebP, or GIF.")).toBeInTheDocument();
  expect(calls.some((c) => c.method === "POST")).toBe(false);
});

test("a GIF banner is uploaded as is", async () => {
  const { calls } = setup(
    {},
    { "POST /api/admin/instance/banner": { ...instance, bannerImageUrl: "/api/uploads/b.gif" } },
  );
  await waitFor(() => expect(screen.getByPlaceholderText("My Blog")).toHaveValue("Blogs"));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await fireEvent.change(input, { target: { files: [new File(["GIF89a"], "b.gif", { type: "image/gif" })] } });
  await waitFor(() => expect(calls.some((c) => c.path === "/api/admin/instance/banner")).toBe(true));
  expect(calls.at(-1)?.headers.get("content-type")).toBe("image/gif");
});

test("a load failure is shown", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/admin/instance": apiError(403, "Admins only") }).fetch);
  render(AdminInstanceSettings);
  await waitFor(() => screen.getByText("Admins only"));
});
