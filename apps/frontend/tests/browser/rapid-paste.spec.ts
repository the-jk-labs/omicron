// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { observePasteSelection, ready, selectEditorText, signedIn } from "./helpers";

test.describe.configure({ retries: 0 });

test.afterEach(async ({ page }, info) => {
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const samples = await body.evaluate((element) =>
    JSON.stringify((element as HTMLElement & { pasteSelections?: unknown[] }).pasteSelections),
  );
  await info.attach("rapid-paste-selection-at-event", { body: samples ?? "null", contentType: "application/json" });
});

for (const target of ["forward passage", "backward passage", "table caret"]) {
  test(`rapid keyboard selection then native paste preserves ${target}`, async ({ page }) => {
    await signedIn(page);
    await ready(
      page,
      target === "table caret" ? "/compose?id=transfer-table" : "/compose?id=9e962281-2222-3333-4444-555555555555",
    );
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    await expect(body).toHaveAttribute("contenteditable", "true");
    await observePasteSelection(body);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async () => {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob(['<p lang="fr" dir="ltr">Bonjour</p>'], { type: "text/html" }),
          "text/plain": new Blob(["Bonjour"], { type: "text/plain" }),
        }),
      ]);
    });

    const cell = body.locator('td[headers="target-left"]');
    const table = target === "table caret";
    const forward = target === "forward passage";
    await selectEditorText(
      page,
      body,
      table
        ? ["Home", "ArrowRight"]
        : forward
          ? ["ControlOrMeta+Home", ...Array<string>(6).fill("ArrowRight"), ...Array<string>(2).fill("Shift+ArrowRight")]
          : ["ControlOrMeta+End", "ArrowLeft", ...Array<string>(2).fill("Shift+ArrowLeft")],
      {
        text: table ? "" : forward ? "bo" : "od",
        anchorText: table ? "alpha" : "Draft body",
        headText: table ? "alpha" : "Draft body",
        anchorOffset: table ? 1 : forward ? 6 : 9,
        headOffset: table ? 1 : forward ? 8 : 7,
        cell: table ? "target-left" : null,
      },
      table ? cell.locator("p") : undefined,
    );
    // Only the starting range settles; never wait/read/retry between this move and paste.
    await page.keyboard.press(table ? "ArrowRight" : forward ? "Shift+ArrowRight" : "Shift+ArrowLeft");
    await page.keyboard.press("ControlOrMeta+v");

    const samples = await body.evaluate(
      (element) => (element as HTMLElement & { pasteSelections?: unknown[] }).pasteSelections,
    );
    expect(samples).toHaveLength(1);
    expect(samples![0]).toMatchObject({
      trusted: true,
      dom: {
        text: target === "table caret" ? "" : "bod",
        anchorText: target === "table caret" ? "alpha" : "Draft body",
        headText: target === "table caret" ? "alpha" : "Draft body",
        anchorOffset: target === "table caret" ? 2 : target === "forward passage" ? 6 : 9,
        headOffset: target === "table caret" ? 2 : target === "forward passage" ? 9 : 6,
      },
    });
    await expect(body.locator('p[lang="fr"]')).toHaveText("Bonjour");
    await expect(body.locator('p[lang="fr"]')).toHaveAttribute("dir", "ltr");
    if (target === "table caret") {
      await expect(cell).toHaveText("alBonjourpha");
      await expect(body.locator('td[headers="target-right"]')).toHaveText("beta");
      await expect(body.getByRole("table", { name: "Destination table", exact: true })).toBeVisible();
      await expect(body.locator("table")).toHaveCount(1);
    } else {
      await expect(body.locator("p").first()).toHaveText("Draft ");
      await expect(body.locator("p").last()).toHaveText("y");
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(target === "table caret" ? cell : body).toHaveText(target === "table caret" ? "alpha" : "Draft body");
  });
}
