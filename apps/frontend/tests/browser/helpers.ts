// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Page } from "@playwright/test";

export async function signedIn(page: Page) {
  await page.context().addCookies([{ name: "a11y-user", value: "1", url: "http://127.0.0.1:4173" }]);
}

export async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Image display", exact: true });
  const menu = page.getByRole("menuitemradio", { name: "Hide images", exact: true });
  // SSR buttons are actionable before hydration; retry only this readiness probe.
  await expect
    .poll(
      async () => {
        if (!(await menu.isVisible())) await trigger.click();
        return menu.isVisible();
      },
      { message: "Image display menu did not become interactive" },
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
}
