// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

const articlePath = "/@ada/hello-world";
const composerPath = "/compose?id=9e962281-2222-3333-4444-555555555555";

async function signedIn(page: Page) {
  await page.context().addCookies([{ name: "a11y-user", value: "1", url: "http://127.0.0.1:4173" }]);
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  // Opening a menu proves that hydration finished, not just server rendering.
  await page.getByRole("button", { name: "Image display", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Hide images", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function accessible(page: Page) {
  await page.evaluate(axe.source);
  const results = await page.evaluate(async () => {
    const engine = (window as typeof window & { axe: typeof axe }).axe;
    const result = await engine.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    const violations = result.violations
      .map(({ id, nodes }) => ({
        id,
        nodes: nodes
          .filter(({ target }) => {
            if (id !== "label-content-name-mismatch" || typeof target[0] !== "string") return true;
            const element = document.querySelector<HTMLElement>(target[0]);
            const visible = element?.innerText.trim() ?? "";
            const name = element?.getAttribute("aria-label") ?? "";
            // Axe discards parentheticals, including our correctly named numeric counts.
            return !(/^\d+$/.test(visible) && name.split(/[^\p{L}\p{N}]+/u).includes(visible));
          })
          .map(({ target, failureSummary }) => ({ target, failureSummary })),
      }))
      .filter(({ nodes }) => nodes.length);
    return { violations, rawViolations: result.violations, incomplete: result.incomplete };
  });
  await test.info().attach("axe-results", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  expect(results.violations).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  for (const path of ["/", "/login", articlePath, composerPath]) {
    test(`${theme}: browser accessibility including contrast on ${path}`, async ({ page }) => {
      if (path === composerPath) await signedIn(page);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await ready(page, path);
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      if (path === composerPath)
        await expect(page.getByRole("textbox", { name: "Article body", exact: true })).toHaveAttribute(
          "contenteditable",
          "true",
        );
      await accessible(page);
    });
  }
}

for (const path of ["/", "/login", articlePath, composerPath]) {
  test(`320 CSS-pixel reflow and text spacing on ${path}`, async ({ page }) => {
    if (path === composerPath) await signedIn(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await ready(page, path);
    await page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }",
      );
      document.adoptedStyleSheets.push(sheet);
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Image display", exact: true })).toBeInViewport();
  });
}

test("skip navigation moves keyboard focus past the sticky header", async ({ page }) => {
  await page.goto(articlePath);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(
    await page.getByRole("main").evaluate((element) => element.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0);
});

test("a card excerpt remains clickable without becoming part of the title link label", async ({ page }) => {
  await ready(page, "/");
  const card = page.getByRole("main").locator("article").first();
  const link = card.getByRole("link", { name: "Hello world", exact: true });
  await expect(link).not.toContainText("A short article");
  const excerpt = card.locator("p").first();
  const box = await excerpt.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page).toHaveURL(articlePath);
});

test("reduced motion hides images and preferences survive reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, articlePath);
  const image = page.getByRole("img", { name: "Sales increased from 10 to 20" });
  await expect(image).toHaveCSS("opacity", "0");
  await expect(page.getByText("Image hidden: Sales increased from 10 to 20")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Image display", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio", { name: "Show images", exact: true }).press("Enter");
  await expect(image).toHaveCSS("opacity", "1");
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(image).toHaveCSS("opacity", "1");
});

test("keyboard authoring dialogs contain focus, dismiss, and return to their opener", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const opener = page.getByRole("button", { name: "Text language", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Text language", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Language tag" })).toBeFocused();
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("keyboard focus remains visible in forced colours and the image menu meets minimum target size", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await ready(page, articlePath);
  const trigger = page.getByRole("button", { name: "Image display", exact: true });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  const outline = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  const targets = [trigger];
  await page.keyboard.press("Enter");
  targets.push(...(await page.getByRole("menuitemradio").all()));
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
});

test("reduced motion also hides images with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4173${articlePath}`);
  await expect(page.getByRole("img", { name: "Sales increased from 10 to 20" })).toHaveCSS("opacity", "0");
  await context.close();
});

test("imported structure survives a title-only autosave until rich editing is accepted", async ({ page }) => {
  await signedIn(page);
  await ready(page, "/compose?id=imported");
  await expect(page.getByRole("alert")).toContainText("simplify imported content");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await expect(body).toHaveAttribute("contenteditable", "false");
  const saved = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().endsWith("/api/posts/imported"),
  );
  await page.getByPlaceholder("Title").fill("New title");
  expect((await saved).postDataJSON().contentHtml).toContain('<figcaption lang="fr">Sales graph</figcaption>');
  await page.getByRole("button", { name: "Edit simplified content" }).click();
  await expect(body).toHaveAttribute("contenteditable", "true");
});
