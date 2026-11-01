// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import AccessibilityGuidance from "#lib/components/AccessibilityGuidance.svelte";
import { expectAccessible } from "../../accessibility";

test("accessibility: authoring guidance explains manual checks without claiming conformance", async () => {
  render(AccessibilityGuidance);
  await fireEvent.click(screen.getByRole("button", { name: "Accessible writing guide" }));
  expect(await screen.findByText(/Automated checks cannot decide/)).toBeInTheDocument();
  expect(screen.getByText(/An image description does not replace a pause control/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Complete WCAG 2.2 reference/ })).toHaveAttribute(
    "href",
    "https://www.w3.org/WAI/WCAG22/quickref/",
  );
  await expectAccessible();
});
