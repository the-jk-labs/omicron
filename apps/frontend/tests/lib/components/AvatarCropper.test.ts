import AvatarCropper from "$lib/components/AvatarCropper.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

const drawImage = vi.fn();
beforeEach(() => {
  // jsdom has no canvas or pointer capture; stand in for both.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
    cb(new Blob(["webp"], { type: "image/webp" }));
  });
  Object.assign(HTMLElement.prototype, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
});

async function setup(w: number, h: number) {
  const onCrop = vi.fn<(f: File) => void>();
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

test("Apply renders the visible square to a 512px WebP and closes", async () => {
  const { img, onCrop } = await setup(560, 280);
  await fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(onCrop).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(img, 140, -0, 280, 280, 0, 0, 512, 512);
  const file = onCrop.mock.calls[0]![0];
  expect([file.name, file.type]).toEqual(["avatar.webp", "image/webp"]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("Apply before the photo has loaded does nothing", async () => {
  const onCrop = vi.fn();
  render(AvatarCropper, { props: { open: true, src: "blob:photo", onCrop } });
  await fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
  expect(onCrop).not.toHaveBeenCalled();
});

test("arrow keys reposition the photo", async () => {
  const { img, surface } = await setup(560, 280);
  surface.focus();
  await fireEvent.keyDown(surface, { key: "ArrowRight" });
  expect(translate(img)).not.toBe("translate(-140px,0px)");
});
