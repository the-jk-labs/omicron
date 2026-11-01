// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import ImageDisplay from "#lib/components/ImageDisplay.svelte";
import { imageDisplay } from "#lib/imageDisplay.svelte.js";
import { expectAccessible } from "../../accessibility";

afterEach(() => imageDisplay.set("system"));

test("accessibility: image visibility can be chosen with keyboard-accessible radio menu items", async () => {
  render(ImageDisplay);
  await fireEvent.keyDown(screen.getByRole("button", { name: "Image display" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitemradio", { name: "Hide images" }));
  expect(imageDisplay.preference).toBe("hide");
  await fireEvent.keyDown(screen.getByRole("button", { name: "Image display" }), { key: "Enter" });
  expect(await screen.findByRole("menuitemradio", { name: "Hide images" })).toHaveAttribute("aria-checked", "true");
  await expectAccessible();
});
