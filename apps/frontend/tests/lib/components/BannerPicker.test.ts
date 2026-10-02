import BannerPicker from "$lib/components/BannerPicker.svelte";
import type { CoverCredit } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

vi.mock(import("$lib/editor/image"), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareImage: async (file: Blob) => ({ blob: file, type: "image/webp" }),
}));

const credit: CoverCredit = {
  name: "Jo",
  nameUrl: "https://u.example/jo",
  source: "Unsplash",
  sourceUrl: "https://unsplash.com",
  license: "Unsplash License",
  licenseUrl: "https://unsplash.com/license",
} as CoverCredit;

let api: ReturnType<typeof fakeFetch>;
function setup(props: Record<string, unknown> = {}, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    "POST /api/uploads": { url: "/api/uploads/new.webp" },
    "GET /api/photos/providers": { providers: ["openverse"] },
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const onChange = vi.fn();
  const r = render(BannerPicker, { props: { onChange, ...props } });
  return { ...r, onChange };
}

const banner = () => document.querySelector<HTMLImageElement>(".aspect-video img");
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

test("with nothing chosen and no body image it says there's no banner", () => {
  setup();
  expect(screen.getByText("No banner yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Remove/ })).toBe(null);
});

test("the post's first image previews as the fallback, labelled as such", () => {
  setup({ contentHtml: '<p>x</p><img src="/api/uploads/body.webp">' });
  expect(banner()).toHaveAttribute("src", "/api/uploads/body.webp");
  expect(screen.getByText("From your post")).toBeInTheDocument();
});

test("a chosen banner wins over the body image and can be removed", async () => {
  const { onChange } = setup({
    coverUrl: "/api/uploads/chosen.webp",
    contentHtml: '<img src="/api/uploads/body.webp">',
  });
  expect(banner()).toHaveAttribute("src", "/api/uploads/chosen.webp");
  expect(screen.queryByText("From your post")).toBe(null);
  await fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
  expect(banner()).toHaveAttribute("src", "/api/uploads/body.webp");
  expect(onChange).toHaveBeenCalled();
});

test("a stock photo's credit links its creator, source and licence", () => {
  setup({ coverUrl: "https://img.example/x.jpg", coverCredit: credit });
  expect(screen.getByRole("link", { name: "Jo" })).toHaveAttribute("href", "https://u.example/jo");
  expect(screen.getByRole("link", { name: "Unsplash" })).toHaveAttribute("href", "https://unsplash.com");
  expect(screen.getByRole("link", { name: "Unsplash License" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
});

test("uploading sets the banner and drops any stock credit", async () => {
  const { onChange } = setup({ coverUrl: "https://img.example/x.jpg", coverCredit: credit });
  await fireEvent.change(fileInput(), { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
  await waitFor(() => expect(banner()).toHaveAttribute("src", "/api/uploads/new.webp"));
  expect(screen.queryByRole("link", { name: "Jo" })).toBe(null);
  expect(api.calls.find((c) => c.path === "/api/uploads")?.headers.get("content-type")).toBe("image/webp");
  expect(onChange).toHaveBeenCalled();
});

test("an unsupported file is refused without uploading", async () => {
  setup();
  await fireEvent.change(fileInput(), { target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] } });
  expect(screen.getByText("Unsupported image type. Use PNG, JPEG, WebP, or GIF.")).toBeInTheDocument();
  expect(api.calls.some((c) => c.path === "/api/uploads")).toBe(false);
});

test("a failed upload is shown and the banner is unchanged", async () => {
  setup({}, { "POST /api/uploads": apiError(413, "File too large") });
  await fireEvent.change(fileInput(), { target: { files: [new File(["x"], "big.png", { type: "image/png" })] } });
  await screen.findByText("File too large");
  expect(screen.getByText("No banner yet")).toBeInTheDocument();
});

test("Free photos opens the stock picker", async () => {
  setup();
  await fireEvent.click(screen.getByRole("button", { name: /Free photos/ }));
  await screen.findByRole("dialog", { name: "Choose a photo" });
});

// B66 again: "{coverCredit.source}</a>{#if …}\n·" — Svelte trims the block's
// leading whitespace, so the credit reads "on Unsplash· Unsplash License".
test.fails("BUG: the credit keeps a space before the licence", () => {
  setup({ coverUrl: "https://img.example/x.jpg", coverCredit: credit });
  expect(screen.getByText(/^Photo by/).textContent?.replace(/\s+/g, " ")).toContain("on Unsplash · Unsplash License");
});
