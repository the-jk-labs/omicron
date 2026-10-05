// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import AvatarCropper from "#lib/components/AvatarCropper.svelte";

const drawImage = vi.fn();
beforeEach(() => {
  // jsdom has no canvas or pointer capture; stand in for both.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
    cb(new Blob(["webp"], { type: "image/webp" }));
  });
  Object.assign(HTMLElement.prototype, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
});

async function setup(w: number, h: number, onCrop = vi.fn<(f: File) => void | Promise<void>>()) {
  render(AvatarCropper, { props: { open: true, src: "blob:photo", onCrop } });
  const img = (await screen.findByRole("dialog")).querySelector("img")!;
  Object.defineProperty(img, "naturalWidth", { value: w });
  Object.defineProperty(img, "naturalHeight", { value: h });
  await fireEvent.load(img);
  return { img, onCrop, surface: screen.getByRole("slider", { name: "Reposition photo" }) };
}

const translate = (img: HTMLImageElement) => img.style.transform;

test("a wide photo is scaled to cover the circle and centred", async () => {
  const { img } = await setup(560, 280);
  expect(img.style.width).toBe("560px");
  expect(img.style.height).toBe("280px");
  expect(translate(img)).toBe("translate(-140px,0px)");
});

test("dragging pans the photo but never past its edges", async () => {
  const { img, surface } = await setup(560, 280);
  await fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 });
  await fireEvent.pointerMove(surface, { clientX: 140, clientY: 160, pointerId: 1 });
  expect(translate(img)).toBe("translate(-100px,0px)");
  await fireEvent.pointerMove(surface, { clientX: 1000, clientY: 160, pointerId: 1 });
  expect(translate(img)).toBe("translate(0px,0px)");
  await fireEvent.pointerUp(surface, { pointerId: 1 });
  await fireEvent.pointerMove(surface, { clientX: 0, clientY: 0, pointerId: 1 });
  expect(translate(img)).toBe("translate(0px,0px)");
});

test("Save renders the visible square to a 512px WebP and closes", async () => {
  const { img, onCrop } = await setup(560, 280);
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onCrop).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(img, 140, -0, 280, 280, 0, 0, 512, 512);
  const file = onCrop.mock.calls[0][0];
  expect([file.name, file.type]).toEqual(["avatar.webp", "image/webp"]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("Save before the photo has loaded does nothing", async () => {
  const onCrop = vi.fn();
  render(AvatarCropper, { props: { open: true, src: "blob:photo", onCrop } });
  await fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  expect(onCrop).not.toHaveBeenCalled();
});

test("Save stays busy until the photo is saved, then closes", async () => {
  const { promise: saving, resolve: finish } = Promise.withResolvers<void>();
  await setup(
    560,
    280,
    vi.fn(() => saving),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const button = await screen.findByRole("button", { name: "Saving…" });
  expect(button).toBeDisabled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("a failed save keeps the dialog open with the reason, ready to retry", async () => {
  await setup(
    560,
    280,
    vi.fn(async () => {
      throw new Error("Storage full");
    }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Storage full");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("arrow keys reposition the photo", async () => {
  const { img, surface } = await setup(560, 280);
  surface.focus();
  await fireEvent.keyDown(surface, { key: "ArrowRight" });
  expect(translate(img)).not.toBe("translate(-140px,0px)");
});
