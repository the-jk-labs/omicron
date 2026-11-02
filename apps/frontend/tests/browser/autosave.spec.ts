// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page, type Route } from "@playwright/test";
import { ready, signedIn } from "./helpers";

// These save-safety checks must not turn green only because a retry passed.
test.describe.configure({ retries: 0 });

const id = "9e962281-2222-3333-4444-555555555555";
const composerPath = `/compose?id=${id}`;
const savePath = `**/api/posts/${id}`;
const title = (page: Page) => page.getByRole("textbox", { name: "Title", exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Article body", exact: true });
const saveStatus = (page: Page) =>
  page.locator('p[aria-live="polite"]').filter({ hasText: /Saving|Saved|Couldn't save/ });

type Write = { title: string; contentHtml: string; contentJson: unknown };

async function acknowledge(route: Route) {
  await route.fulfill({ json: { post: { id } } });
}

async function append(page: Page, text: string) {
  await expect(editor(page)).toHaveAttribute("contenteditable", "true");
  await editor(page).focus();
  // Confirm the caret after the focus/selection frame before inserting text once.
  await expect
    .poll(async () => {
      await page.keyboard.press("ControlOrMeta+End");
      return editor(page).evaluate(
        (element) =>
          new Promise<boolean>((resolve) =>
            requestAnimationFrame(() => {
              const selection = window.getSelection();
              if (!selection?.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) {
                resolve(false);
                return;
              }
              const remainder = document.createRange();
              remainder.selectNodeContents(element);
              remainder.setStart(selection.anchorNode, selection.anchorOffset);
              resolve(remainder.toString() === "");
            }),
          ),
      );
    })
    .toBe(true);
  await page.keyboard.insertText(text);
}

for (const failure of ["unavailable", "offline", "expired session"] as const) {
  test(`autosave preserves edits and recovers after ${failure}`, async ({ page }) => {
    await signedIn(page);
    await ready(page, composerPath);
    const writes: Write[] = [];
    let available = false;
    await page.route(savePath, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      writes.push(route.request().postDataJSON());
      const authenticated = route.request().headers().cookie?.includes("a11y-user=1");
      if (available && (failure !== "expired session" || authenticated)) return acknowledge(route);
      if (failure === "offline") return route.abort("internetdisconnected");
      await route.fulfill({
        status: failure === "expired session" ? 401 : 503,
        json: { error: failure === "expired session" ? "Sign in required" : "Temporarily unavailable" },
      });
    });
    if (failure === "expired session") await page.context().clearCookies({ name: "a11y-user" });
    await title(page).fill("Keep my unsaved draft");
    await append(page, " before failure");
    await expect(saveStatus(page)).toHaveText("Couldn't save");
    await expect(saveStatus(page)).toHaveAttribute(
      "title",
      failure === "offline" ? /fetch/i : failure === "expired session" ? "Sign in required" : "Temporarily unavailable",
    );
    await expect(editor(page)).toBeFocused();
    await expect(editor(page)).toHaveText("Draft body before failure");
    await expect(title(page)).toHaveValue("Keep my unsaved draft");
    await expect(page).toHaveURL(composerPath);

    available = true;
    // Restores only the dummy fixture session, not a real sign-in flow.
    if (failure === "expired session") await signedIn(page);
    await append(page, " and after recovery");
    await expect(saveStatus(page)).toHaveText(/^\s*Saved /);
    await expect(saveStatus(page)).not.toHaveAttribute("title");
    await expect(editor(page)).toBeFocused();
    await expect(editor(page)).toHaveText("Draft body before failure and after recovery");
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ title: "Keep my unsaved draft" });
    expect(writes[0].contentHtml).toContain("before failure");
    expect(writes[1].contentHtml).toContain("before failure and after recovery");
    expect(writes[1]).toMatchObject({ title: "Keep my unsaved draft" });
    expect(JSON.stringify(writes[1].contentJson)).toContain("before failure and after recovery");
    for (const write of writes) {
      expect(write).not.toHaveProperty("status");
      expect(write).not.toHaveProperty("publishAt");
    }
  });
}

test("failed autosave retries without another edit", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const writes: Write[] = [];
  await page.route(savePath, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push(route.request().postDataJSON());
    if (writes.length > 1) return acknowledge(route);
    await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
  });
  await append(page, " retry unchanged");
  await expect(saveStatus(page)).toHaveText("Couldn't save");
  await expect(saveStatus(page)).toHaveText(/^\s*Saved /, { timeout: 20_000 });
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  await expect(editor(page)).toHaveText("Draft body retry unchanged");
  await expect(editor(page)).toBeFocused();
});

test("a recovered new draft updates its acknowledged ID instead of creating again", async ({ page }) => {
  await signedIn(page);
  await ready(page, "/compose");
  const writes: { method: string; body: Write }[] = [];
  const createdId = "browser-recovered-draft";
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push({ method: "POST", body: route.request().postDataJSON() });
    if (writes.length === 1) {
      await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
      return;
    }
    await route.fulfill({ json: { post: { id: createdId } } });
  });
  await page.route(`**/api/posts/${createdId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push({ method: "PATCH", body: route.request().postDataJSON() });
    await route.fulfill({ json: { post: { id: createdId } } });
  });
  await title(page).fill("New draft recovery");
  await append(page, "Fresh words");
  await expect(saveStatus(page)).toHaveText("Couldn't save");
  await expect(page).toHaveURL("/compose");
  await append(page, " recovered");
  await expect(page).toHaveURL(`/compose?id=${createdId}`);
  await expect(saveStatus(page)).toHaveText(/^\s*Saved /);
  await append(page, " updated");
  await expect.poll(() => writes.length).toBe(3);
  await expect(saveStatus(page)).toHaveText(/^\s*Saved /);
  await expect(editor(page)).toHaveText("Fresh words recovered updated");
  await expect(editor(page)).toBeFocused();
  expect(writes.map(({ method }) => method)).toEqual(["POST", "POST", "PATCH"]);
  for (const write of writes.slice(0, 2)) expect(write.body).toMatchObject({ status: "draft" });
  expect(writes[2].body).not.toHaveProperty("status");
  expect(writes[2].body).not.toHaveProperty("publishAt");
  expect(writes[2].body.contentHtml).toContain("Fresh words recovered updated");
});

test("keyboard navigation can stay after a failed save without losing edits", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  await page.route(savePath, (route) => route.fulfill({ status: 401, json: { error: "Sign in required" } }));
  await append(page, " keep on this page");
  const home = page.getByRole("link", { name: "Omicron", exact: true });
  await home.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  const stay = dialog.getByRole("button", { name: "Stay", exact: true });
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stay).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Leave", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stay).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(home).toBeFocused();
  await expect(page).toHaveURL(composerPath);
  await expect(editor(page)).toHaveText("Draft body keep on this page");
});

test("cancelling a real reload keeps the unsaved draft after autosave fails", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  await page.route(savePath, (route) => route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }));
  await append(page, " do not reload");
  await expect(saveStatus(page)).toHaveText("Couldn't save");
  const prompt = page.waitForEvent("dialog");
  // A cancelled reload never commits; do not wait for a navigation load event.
  const reload = page.evaluate(() => location.reload());
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(page).toHaveURL(composerPath);
  await expect(editor(page)).toHaveText("Draft body do not reload");
  await expect(saveStatus(page)).toHaveText("Couldn't save");
});
