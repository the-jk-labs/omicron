// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from "@playwright/test";

// Reach the sign-in code step: the sign-in answers with a two-factor challenge.
async function codeStep(page: Page) {
  await page.addInitScript(() => {
    const blocked: string[] = [];
    (window as typeof window & { cspBlocked?: string[] }).cspBlocked = blocked;
    document.addEventListener("securitypolicyviolation", (e) => blocked.push(e.violatedDirective));
  });
  await page.route("**/api/auth/sign-in/**", (route) =>
    route.fulfill({ json: { twoFactorRedirect: true, twoFactorMethods: ["totp"] } }),
  );
  await page.goto("/login");
  await page.getByLabel("Username or email").fill("ada");
  await page.locator("#password").fill("secret");
  await page.locator("#password").press("Enter");
  const code = page.getByLabel("Code from your authenticator app");
  await code.waitFor();
  return code;
}

// Bits UI's PinInput hides its real input with rules it injects as a <style>
// element, which the strict style-src CSP blocks.
test("the code field applies no style the CSP blocks", async ({ page }) => {
  const code = await codeStep(page);
  await code.focus();
  await page.keyboard.type("747877");
  await expect(code).toHaveValue("747877");
  expect(await page.evaluate(() => (window as typeof window & { cspBlocked?: string[] }).cspBlocked)).toEqual([]);
});
