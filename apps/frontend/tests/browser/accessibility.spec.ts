// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Locator, type Page } from "@playwright/test";
import axe from "axe-core";
import { complexTableHtml } from "../lib/editor/transfer-fixtures";
import { editorSelection, observePasteSelection, ready, selectEditorText, signedIn } from "./helpers";

// Preservation checks must not turn green only because a scenario retry passed.
test.describe.configure({ retries: 0 });

test.afterEach(async ({ page }, info) => {
  if (/native clipboard rich-caption review/.test(info.title)) {
    const actions = await page.evaluate(() =>
      JSON.stringify((window as typeof window & { reviewActions?: unknown[] }).reviewActions),
    );
    await info.attach("review-dialog-actions", { body: actions ?? "null", contentType: "application/json" });
  }
  if (!/native clipboard partial replacement|native clipboard into a table cell retains/.test(info.title)) return;
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const samples = await body.evaluate((element) =>
    JSON.stringify((element as HTMLElement & { pasteSelections?: unknown[] }).pasteSelections),
  );
  await info.attach("paste-selection-at-event", { body: samples ?? "null", contentType: "application/json" });
});

const articlePath = "/@ada/hello-world";
const composerPath = "/compose?id=9e962281-2222-3333-4444-555555555555";

async function selectDraftPassage(page: Page) {
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await selectEditorText(page, body, ["ControlOrMeta+Home", ...Array<string>(5).fill("Shift+ArrowRight")], {
    text: "Draft",
    anchorText: "Draft body",
    headText: "Draft body",
    anchorOffset: 0,
    headOffset: 5,
    cell: null,
  });
  return body;
}

async function writeClipboard(page: Page, html: string, withImage = false) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(
    async ({ sourceHtml, includeImage }) => {
      const text = new DOMParser().parseFromString(sourceHtml, "text/html").body.textContent ?? "";
      const data: Record<string, Blob> = {
        "text/html": new Blob([sourceHtml], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      };
      if (includeImage) {
        const canvas = new OffscreenCanvas(2, 2);
        canvas.getContext("2d")!.clearRect(0, 0, 2, 2);
        data["image/png"] = await canvas.convertToBlob({ type: "image/png" });
      }
      await navigator.clipboard.write([new ClipboardItem(data)]);
    },
    { sourceHtml: html, includeImage: withImage },
  );
}

async function dragContent(page: Page, target: Locator, sourceHtml: string) {
  await page.evaluate(
    ({ markup }) => {
      const element = document.createElement("div");
      element.id = "test-content-drag";
      element.draggable = true;
      element.textContent = "Drag test content";
      element.className = "bg-background text-foreground";
      Object.assign(element.style, {
        position: "fixed",
        bottom: "16px",
        left: "16px",
        width: "160px",
        height: "32px",
        zIndex: "40",
      });
      element.addEventListener("dragstart", (event) => {
        const data = event.dataTransfer;
        if (!data) return;
        data.setData("text/html", markup);
        data.setData("text/plain", new DOMParser().parseFromString(markup, "text/html").body.textContent ?? "");
        data.effectAllowed = "copy";
      });
      document.addEventListener(
        "drop",
        (event) => {
          element.dataset.dropPayload = JSON.stringify({
            trusted: event.isTrusted,
            types: event.dataTransfer?.types,
            files: Array.from(event.dataTransfer?.files ?? []).map((item) => item.type),
          });
        },
        { capture: true, once: true },
      );
      document.body.append(element);
    },
    { markup: sourceHtml },
  );
  const handle = page.locator("#test-content-drag");
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  try {
    await handle.dragTo(target, { targetPosition: { x: 1, y: box!.height / 2 } });
    const payload = JSON.parse((await handle.getAttribute("data-drop-payload")) ?? "null");
    expect(payload?.trusted).toBe(true);
    expect(payload?.types).toContain("text/html");
  } finally {
    await test.info().attach("native-drag-payload", {
      body: (await handle.getAttribute("data-drop-payload")) ?? "null",
      contentType: "application/json",
    });
    await handle.evaluate((element) => element.remove());
  }
}

async function dropFileContent(target: Locator, sourceHtml = "", filesOnly = false) {
  await target.scrollIntoViewIfNeeded();
  const payload = await target.evaluate(
    async (element, { markup, onlyFiles }) => {
      const data = new DataTransfer();
      if (!onlyFiles) {
        data.setData("text/html", markup);
        data.setData("text/plain", new DOMParser().parseFromString(markup, "text/html").body.textContent ?? "");
      }
      const canvas = new OffscreenCanvas(2, 2);
      canvas.getContext("2d")!.clearRect(0, 0, 2, 2);
      data.items.add(
        new File([await canvas.convertToBlob({ type: "image/png" })], "dropped.png", { type: "image/png" }),
      );
      const box = element.getBoundingClientRect();
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 1,
        clientY: box.top + box.height / 2,
        dataTransfer: data,
      });
      element.dispatchEvent(event);
      return {
        trusted: event.isTrusted,
        types: data.types,
        files: Array.from(data.files).map((item) => item.type),
        handled: event.defaultPrevented,
      };
    },
    { markup: sourceHtml, onlyFiles: filesOnly },
  );
  await test
    .info()
    .attach("synthetic-file-drop-payload", { body: JSON.stringify(payload), contentType: "application/json" });
  expect(payload.files).toEqual(["image/png"]);
  expect(payload.handled).toBe(true);
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

for (const path of ["/", "/login", articlePath, composerPath]) {
  test(`readiness waits for delayed hydration on ${path}`, async ({ page }) => {
    if (path === composerPath) await signedIn(page);
    let scriptsReady: Promise<void> | undefined;
    await page.route("**/_app/immutable/**/*.js", async (route) => {
      // Hold only the first wave; later imports share the same release point.
      scriptsReady ??= new Promise((resolve) => setTimeout(resolve, 2_000));
      await scriptsReady;
      await route.continue();
    });
    await ready(page, path);
    await expect(page.getByRole("menuitemradio", { name: "Hide images", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Image display", exact: true })).toBeFocused();
  });
}

test("readiness rejects a visible page when client scripts fail", async ({ page }) => {
  await page.route("**/_app/immutable/**/*.js", (route) => route.abort());
  await expect(ready(page, articlePath)).rejects.toThrow("Image display menu did not become interactive");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Image display", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Hide images", exact: true })).toBeHidden();
});

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
    await expect(
      page.getByRole("button", { name: path === "/login" ? "Image display" : "Menu", exact: true }),
    ).toBeInViewport();
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

test("Alt+F10 reaches the formatting toolbar and Escape restores the selected passage", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  await page.keyboard.press("Alt+F10");
  await expect(page.getByRole("button", { name: "Text style", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();
  await expect.poll(() => editorSelection(body)).toMatchObject({ text: "Draft", aligned: true });
  await expect(body).toHaveText("Draft body");
  await expect(body).toHaveAccessibleDescription(/Alt\+F10/);
  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("Alt+F10");
  await expect(body).toBeFocused();
  await expect.poll(() => editorSelection(body)).toMatchObject({ text: "Draft", aligned: true });
});

test("toolbar arrow navigation reaches dropdowns and applies bold only to the selected passage", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  const style = page.getByRole("button", { name: "Text style", exact: true });
  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(style).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Heading 1", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(style).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(body.locator("strong")).toHaveText("Draft");
  await expect(body).toHaveText("Draft body");
  await expect(body).toBeFocused();
});

test("toolbar dialogs and popovers close before Escape returns to the article body", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("End");
  const emoji = page.getByRole("button", { name: "Emoji", exact: true });
  await expect(emoji).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("emoji-picker")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(emoji).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  const language = page.getByRole("button", { name: "Text language", exact: true });
  await expect(language).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Text language", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Alt+F10");
  await expect(dialog.getByRole("textbox", { name: "Language tag", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(language).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();
  await expect.poll(() => editorSelection(body)).toMatchObject({ text: "Draft", aligned: true });
});

test("formatting shortcuts retain bold, italic, underline and all six heading levels", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  for (const [key, tag] of [
    ["b", "strong"],
    ["i", "em"],
    ["u", "u"],
  ]) {
    await page.keyboard.press(`ControlOrMeta+${key}`);
    await expect(body.locator(tag)).toHaveText("Draft");
    await page.keyboard.press(`ControlOrMeta+${key}`);
    await expect(body.locator(tag)).toHaveCount(0);
  }
  for (let level = 1; level <= 6; level++) {
    await page.keyboard.press(`ControlOrMeta+Alt+${level}`);
    await expect(body.locator(`h${level}`)).toHaveText("Draft body");
  }
});

test("toolbar shortcuts do not intercept the post title or ordinary Tab navigation", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.focus();
  await page.keyboard.press("Alt+F10");
  await expect(title).toBeFocused();
  const body = await selectDraftPassage(page);
  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("Tab");
  await expect(body).toBeFocused();
});

test("toolbar arrow navigation includes contextual table actions", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(body.locator("table")).toHaveCount(1);
  await page.keyboard.press("Alt+F10");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("button", { name: "Text language", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  const table = page.getByRole("button", { name: "Edit table", exact: true });
  await expect(table).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Row below", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(table).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();
  await expect.poll(() => editorSelection(body)).toMatchObject({ aligned: true });
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

test("the link keyboard shortcut opens the authoring dialog for the selected passage", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = await selectDraftPassage(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Add link", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "URL", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();
  await expect.poll(() => editorSelection(body)).toMatchObject({ text: "Draft", aligned: true });
  await expect(body.locator("a")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await dialog.getByRole("textbox", { name: "URL", exact: true }).fill("https://example.org/reference");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(body.locator("a")).toHaveText("Draft");
  await expect(body.locator("a")).toHaveAttribute("href", "https://example.org/reference");
  await expect(body).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(body.locator("a")).toHaveCount(0);
  await expect(body).toHaveText("Draft body");
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

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: native clipboard loss review can cancel, accept, and undo with the keyboard`, async ({ page }) => {
    await signedIn(page);
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    await ready(page, composerPath);
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    await writeClipboard(
      page,
      '<figure><img src="/api/uploads/chart.gif" alt="Sales chart"><figcaption lang="fr">Chart caption</figcaption></figure>',
    );
    await body.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+v");
    const dialog = page.getByRole("dialog", { name: "Review pasted content" });
    await expect(dialog).toBeVisible();
    await expect(body).toHaveText("Draft body");
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(body).toBeFocused();
    await page.keyboard.press("ControlOrMeta+v");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Paste simplified content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(body).toBeFocused();
    await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(body).toHaveText("Draft body");
  });
}

test("native clipboard image rehosting retains its description and adjacent text", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(
    page,
    '<p>Before the image</p><img src="/api/uploads/chart.gif" alt="Sales chart" lang="en"><p>After the image</p>',
    true,
  );
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  const upload = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/uploads"),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await upload;
  await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
  await expect(body.locator("img")).toHaveAttribute("lang", "en");
  await expect(body).toContainText("Before the image");
  await expect(body).toContainText("After the image");
});

test("native clipboard headings and passage metadata survive without a loss warning", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, '<h2>New section</h2><p lang="fr" dir="ltr">Translated passage</p>');
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(body.locator("h2")).toHaveText("New section");
  await expect(body.locator('p[lang="fr"]')).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("explicit paste-as-plain-text does not trigger an HTML loss warning", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, "<figure><figcaption>Plain caption</figcaption></figure>");
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+Shift+v");
  await expect(body).toHaveText("Plain caption");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("live authoring tables expose their caption and update their accessible name after editing", async ({ page }) => {
  await signedIn(page);
  await ready(page, "/compose?id=table");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const table = body.getByRole("table", { name: "Sales table", exact: true });
  await expect(table.locator("caption")).toBeVisible();
  await expect(table.locator("caption")).toHaveAttribute("lang", "en");
  await table.getByRole("columnheader", { name: "Year" }).click();
  await page.getByRole("button", { name: "Edit table", exact: true }).click();
  await page.getByRole("menuitem", { name: "Table accessibility", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Table accessibility", exact: true });
  await dialog.getByRole("textbox", { name: "Table caption", exact: true }).fill("Updated sales table");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(body.getByRole("table", { name: "Updated sales table", exact: true })).toBeVisible();
  await accessible(page);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: pointer-dropped HTML can be reviewed, cancelled, accepted and undone with the keyboard`, async ({
    page,
  }) => {
    await signedIn(page);
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    await ready(page, composerPath);
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    const html =
      '<figure><img src="/api/uploads/chart.gif" alt="Sales chart"><figcaption lang="en">Chart caption</figcaption></figure>';
    await body.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await dragContent(page, body.locator("p").first(), html);
    const dialog = page.getByRole("dialog", { name: "Review dropped content" });
    await expect(dialog).toBeVisible();
    await expect(body).toHaveText("Draft body");
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(body).toBeFocused();
    await expect(body).toHaveText("Draft body");
    await dragContent(page, body.locator("p").first(), html);
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Insert simplified content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(body).toBeFocused();
    await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
    await expect(body).toContainText("Draft body");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(body).toHaveText("Draft body");
  });
}

test("file-bearing drop events retain image metadata and context", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  const upload = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/uploads"),
  );
  await dropFileContent(
    body.locator("p").first(),
    '<p>Image context</p><img src="/api/uploads/chart.gif" alt="Sales chart" lang="en"><p>Image details</p>',
  );
  await upload;
  await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
  await expect(body.locator("img")).toHaveAttribute("lang", "en");
  await expect(body).toContainText("Image context");
  await expect(body).toContainText("Image details");
  await expect(body).toContainText("Draft body");
  await expect(body).toBeFocused();
});

test("file-only drop events request image review instead of inventing descriptions", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await dropFileContent(body.locator("p").first(), "", true);
  await expect(body.locator("img")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Check accessibility (1)", exact: true })).toBeVisible();
  await expect(body.getByRole("button", { name: "Add alt text for this image", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("failed file-drop uploads retain the article and keyboard focus", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  await page.route("**/api/uploads", (route) =>
    route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ error: "Image too large" }) }),
  );
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await dropFileContent(body.locator("p").first(), '<img src="/api/uploads/chart.gif" alt="Sales chart">');
  await expect(page.getByRole("alert")).toHaveText("Image too large");
  await expect(body).toHaveText("Draft body");
  await expect(body).toBeFocused();
});

test("internal pointer moves retain image metadata without uploading a second copy", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, '<p>Before</p><img src="/api/uploads/chart.gif" alt="Sales chart" lang="en"><p>After</p>');
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/uploads")) uploads.push(request.url());
  });
  await body.locator("img").dragTo(body.locator("p").last());
  await expect
    .poll(() =>
      body.evaluate((element) => {
        const image = element.querySelector("img");
        const paragraph = [...element.querySelectorAll("p")].find((node) => node.textContent === "After");
        return !!(image && paragraph && paragraph.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    )
    .toBe(true);
  await expect(body.locator("img")).toHaveCount(1);
  await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
  await expect(body.locator("img")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(uploads).toEqual([]);
});

test("document navigation and native cut/paste provide a keyboard alternative to moving an image", async ({ page }) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, '<p>Before</p><img src="/api/uploads/chart.gif" alt="Sales chart" lang="en"><p>After</p>');
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await page.getByRole("button", { name: "Find and navigate", exact: true }).press("Enter");
  await page.getByRole("combobox", { name: "Go to document element", exact: true }).press("Enter");
  await page.keyboard.press("i");
  await expect(page.getByRole("option", { name: "image: Sales chart", exact: true })).toHaveAttribute(
    "data-highlighted",
    "",
  );
  await page.keyboard.press("Enter");
  await expect(body).toBeFocused();
  await expect(body.locator(".img-resizer.is-selected")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(body.locator("img")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+End");
  await expect
    .poll(() =>
      body.evaluate((element) => {
        const selection = window.getSelection();
        const last = element.querySelector("p:last-child");
        return !!(
          last &&
          selection &&
          last.contains(selection.focusNode) &&
          selection.focusOffset === last.textContent?.length
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(body.locator("img")).toHaveCount(1);
  await expect(body.locator("img")).toHaveAttribute("alt", "Sales chart");
  await expect(body.locator("img")).toHaveAttribute("lang", "en");
  await expect
    .poll(() =>
      body.evaluate((element) => {
        const image = element.querySelector("img");
        const paragraph = [...element.querySelectorAll("p")].find((node) => node.textContent === "After");
        return !!(image && paragraph && paragraph.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    )
    .toBe(true);
});

test("native clipboard partial replacement preserves block language and both unselected text remainders", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await observePasteSelection(body);
  await writeClipboard(page, '<p lang="fr" dir="ltr">Bonjour <span lang="de">Welt</span></p>');
  await selectEditorText(
    page,
    body,
    ["ControlOrMeta+Home", ...Array<string>(6).fill("ArrowRight"), ...Array<string>(3).fill("Shift+ArrowRight")],
    { text: "bod", anchorText: "Draft body", headText: "Draft body", anchorOffset: 6, headOffset: 9, cell: null },
  );
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("bod");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(body.locator('p[lang="fr"]')).toHaveText("Bonjour Welt");
  await expect(body.locator('span[lang="de"]')).toHaveText("Welt");
  await expect(body.locator("p").first()).toHaveText("Draft ");
  await expect(body.locator("p").last()).toHaveText("y");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body).toHaveText("Draft body");
});

test("native clipboard into a table cell retains destination headers, caption and undo", async ({ page }) => {
  await signedIn(page);
  await ready(page, "/compose?id=transfer-table");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await observePasteSelection(body);
  const cell = body.locator('td[headers="target-left"]');
  await writeClipboard(page, '<p lang="fr" dir="ltr">Bonjour</p>');
  await selectEditorText(
    page,
    body,
    ["Home", "ArrowRight", "ArrowRight"],
    { text: "", anchorText: "alpha", headText: "alpha", anchorOffset: 2, headOffset: 2, cell: "target-left" },
    cell.locator("p"),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(cell.locator('p[lang="fr"]')).toHaveText("Bonjour");
  await expect(cell.locator('p[lang="fr"]')).toHaveAttribute("dir", "ltr");
  await expect(cell).toHaveText("alBonjourpha");
  await expect(body.locator('td[headers="target-right"]')).toHaveText("beta");
  await expect(body.getByRole("table", { name: "Destination table", exact: true })).toBeVisible();
  await expect(body.locator("table")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell).toHaveText("alpha");
});

test("native clipboard image in a table cell retains its long description through autosave and undo", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, "/compose?id=transfer-table");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const cell = body.locator('td[headers="target-left"]');
  await writeClipboard(
    page,
    '<img src="/api/uploads/chart.gif" alt="Sales chart" lang="en" aria-describedby="chart-description"><p id="chart-description">Sales doubled.</p>',
    true,
  );
  await cell.locator("p").click();
  await page.keyboard.press("Home");
  const saved = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().endsWith("/api/posts/transfer-table") &&
      request.postDataJSON().contentHtml.includes('id="chart-description"'),
  );
  const uploaded = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/uploads"),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await uploaded;
  await expect(cell.locator("img")).toHaveAccessibleDescription("Sales doubled.");
  await expect(cell.locator("img")).toHaveAttribute("alt", "Sales chart");
  await expect(cell.locator("img")).toHaveAttribute("lang", "en");
  await expect(cell.locator("#chart-description")).toHaveText("Sales doubled.");
  await expect(body.locator('td[headers="target-right"]')).toHaveText("beta");
  const html = (await saved).postDataJSON().contentHtml as string;
  expect(html).toContain('aria-describedby="chart-description"');
  expect(html).toContain('headers="target-left"');
  expect(html).not.toContain('contenteditable="false"');
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell).toHaveText("alpha");
  await expect(body.locator("img")).toHaveCount(0);
  await expect(body.getByRole("table", { name: "Destination table", exact: true })).toBeVisible();
});

test("trusted HTML drop into a table cell preserves the grid instead of replacing the old selection", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, "/compose?id=transfer-table");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const cell = body.locator('td[headers="target-left"]');
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await dragContent(page, cell.locator("p"), '<p lang="fr" dir="ltr">Bonjour</p>');
  await expect(cell.locator('p[lang="fr"]')).toHaveText("Bonjour");
  await expect(cell).toContainText("alpha");
  await expect(body.locator('td[headers="target-right"]')).toHaveText("beta");
  await expect(body.locator("tr")).toHaveCount(2);
  await expect(body.getByRole("table", { name: "Destination table", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell).toHaveText("alpha");
});

test("native clipboard complex tables retain spans, caption language and resolved header relationships", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, complexTableHtml);
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  const table = body.getByRole("table", { name: "Sales by region", exact: true });
  await expect(table).toHaveAccessibleDescription("Values exclude returns.");
  await expect(table.locator("caption")).toHaveAttribute("lang", "fr");
  await expect(table.locator("caption")).toHaveAttribute("dir", "ltr");
  await expect(table.locator("#region")).toHaveAttribute("rowspan", "2");
  await expect(table.locator("#totals")).toHaveAttribute("colspan", "2");
  await expect(table.locator("#totals")).toHaveAttribute("scope", "colgroup");
  await expect(table.locator('[headers="north count"]')).toHaveText("20");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body).toHaveText("Draft body");
});

for (const focusTiming of ["normal", "delayed animation frame"]) {
  test(`native clipboard rich-caption review at a cell target can cancel, accept and undo: ${focusTiming}`, async ({
    page,
  }) => {
    await signedIn(page);
    await ready(page, "/compose?id=transfer-table");
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    const cell = body.locator('td[headers="target-left"]');
    await page.evaluate(() => {
      const host = window as typeof window & { reviewActions: unknown[] };
      host.reviewActions = [];
      for (const type of ["keydown", "click"]) {
        document.addEventListener(
          type,
          (event) => {
            const target = event.target as HTMLElement;
            host.reviewActions.push({
              type,
              key: (event as KeyboardEvent).key,
              trusted: event.isTrusted,
              tag: target.tagName,
              text: target.textContent?.slice(0, 80),
              inDialog: !!target.closest('[role="dialog"]'),
            });
          },
          { capture: true },
        );
      }
    });
    await writeClipboard(
      page,
      '<table><caption>Sales <span lang="fr">annuelles</span></caption><tr><td>20</td></tr></table>',
    );
    await cell.locator("p").click();
    await page.keyboard.press("Home");
    const original = await body.innerHTML();
    await page.keyboard.press("ControlOrMeta+v");
    const dialog = page.getByRole("dialog", { name: "Review pasted content" });
    await expect(dialog).toContainText("span lang: fr");
    await page.keyboard.press("Escape");
    await expect(body).toBeFocused();
    expect(await body.innerHTML()).toBe(original);
    if (focusTiming === "delayed animation frame") {
      await page.evaluate(() => {
        const request = window.requestAnimationFrame.bind(window);
        const cancel = window.cancelAnimationFrame.bind(window);
        const pending = new Map<number, FrameRequestCallback>();
        let id = 0;
        // Hold initial focus until Tab completes, or release it later for a sequence that waits for focus.
        window.requestAnimationFrame = (callback) => {
          pending.set(--id, callback);
          return id;
        };
        window.cancelAnimationFrame = (handle) => {
          if (handle < 0) pending.delete(handle);
          else cancel(handle);
        };
        const release = (event?: KeyboardEvent) => {
          if (event && event.key !== "Tab") return;
          document.removeEventListener("keyup", release, true);
          window.clearTimeout(timer);
          window.requestAnimationFrame = request;
          window.cancelAnimationFrame = cancel;
          const callbacks = [...pending.values()];
          pending.clear();
          for (const callback of callbacks) callback(performance.now());
        };
        const timer = window.setTimeout(() => release(), 250);
        document.addEventListener("keyup", release, true);
      });
    }
    await page.keyboard.press("ControlOrMeta+v");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Paste simplified content", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(body).toContainText("Sales annuelles");
    const activations = await page.evaluate(() =>
      (window as typeof window & { reviewActions: { type: string; key?: string }[] }).reviewActions.filter(
        (action) => action.type === "keydown" && action.key === "Enter",
      ),
    );
    expect(activations).toMatchObject([
      { trusted: true, tag: "BUTTON", text: "Paste simplified content", inDialog: true },
    ]);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(body.locator("table")).toHaveCount(1);
    await expect(cell).toHaveText("alpha");
    await expect(body.getByRole("table", { name: "Destination table", exact: true })).toBeVisible();
  });
}

for (const kind of ["paste", "drop"] as const) {
  test(`native ${kind} remaps colliding description IDs without changing either image's association`, async ({
    page,
  }) => {
    await signedIn(page);
    await ready(page, composerPath);
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    await writeClipboard(
      page,
      '<img src="/api/uploads/chart.gif" alt="Existing chart" aria-describedby="details"><p id="details">Existing description</p><p>Target</p>',
    );
    await body.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+v");
    const original = body.getByRole("img", { name: "Existing chart", exact: true });
    await expect(original).toHaveAccessibleDescription("Existing description");
    const html =
      '<img src="/api/uploads/chart.gif" alt="New chart" aria-describedby="details"><p id="details">New description</p>';
    if (kind === "paste") {
      await writeClipboard(page, html);
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("ControlOrMeta+v");
    } else {
      await page.keyboard.press("ControlOrMeta+a");
      await dragContent(page, body.locator("p").last(), html);
    }
    const image = body.getByRole("img", { name: "New chart", exact: true });
    await expect(image).toHaveAccessibleDescription("New description");
    await expect(image).toHaveAttribute("aria-describedby", "details-copy");
    await expect(original).toHaveAccessibleDescription("Existing description");
    await expect(body.locator('[id="details"]')).toHaveCount(1);
    await expect(body.locator('[id="details-copy"]')).toHaveText("New description");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(image).toHaveCount(0);
    await expect(original).toHaveAccessibleDescription("Existing description");
    await expect(body.locator('[id="details-copy"]')).toHaveCount(0);
  });
}

test("native image-only copy cannot silently lose its long description when pasted over the article", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(
    page,
    '<img src="/api/uploads/chart.gif" alt="Sales chart" aria-describedby="details"><p id="details">Full description</p>',
  );
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  const image = body.getByRole("img", { name: "Sales chart", exact: true });
  await expect(image).toHaveAccessibleDescription("Full description");
  await image.click();
  await expect(body.locator(".img-resizer.is-selected")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  const dialog = page.getByRole("dialog", { name: "Review pasted content" });
  await expect(dialog).toContainText("missing aria-describedby target: details");
  await expect(dialog.getByRole("button", { name: "Paste simplified content" })).toHaveCount(0);
  await expect(image).toHaveAccessibleDescription("Full description");
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();
  await expect(image).toHaveAccessibleDescription("Full description");
  await expect(body.locator("#details")).toHaveText("Full description");
});

test("repeated native table paste remaps caption, description and header IDs as one undoable transfer", async ({
  page,
}) => {
  await signedIn(page);
  await ready(page, composerPath);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await writeClipboard(page, complexTableHtml);
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(body.getByRole("table", { name: "Sales by region", exact: true })).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("ControlOrMeta+v");
  const tables = body.getByRole("table", { name: "Sales by region", exact: true });
  await expect(tables).toHaveCount(2);
  await expect(tables.nth(1)).toHaveAttribute("aria-labelledby", "sales-caption-copy");
  await expect(tables.nth(1)).toHaveAccessibleDescription("Values exclude returns.");
  await expect(tables.nth(1).locator("#totals-copy")).toHaveAttribute("colspan", "2");
  await expect(tables.nth(1).locator('[headers="north-copy count-copy"]')).toHaveText("20");
  await expect(body.locator('[id="sales-caption"]')).toHaveCount(1);
  await expect(body.locator('[id="sales-caption-copy"]')).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(tables).toHaveCount(1);
  await expect(tables.first()).toHaveAccessibleDescription("Values exclude returns.");
});
