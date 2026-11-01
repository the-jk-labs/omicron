// SPDX-License-Identifier: AGPL-3.0-or-later
import axe from "axe-core";
import { expect } from "vitest";

export async function expectAccessible(element: Element = document.body) {
  const { violations } = await axe.run(element, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    // jsdom has no layout or painted colours; contrast needs a real browser.
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ html, failureSummary }) => ({ html, failureSummary })),
    })),
  ).toEqual([]);
}
