// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Locator, type Page } from "@playwright/test";
import type { Editor } from "@tiptap/core";

export async function editorSelection(body: Locator) {
  return body.evaluate((element) => {
    const editor = (element as HTMLElement & { editor: Editor }).editor;
    const dom = window.getSelection();
    const anchor = dom?.anchorNode;
    const head = dom?.focusNode;
    const domAnchor = anchor && element.contains(anchor) ? editor.view.posAtDOM(anchor, dom.anchorOffset) : null;
    const domHead = head && element.contains(head) ? editor.view.posAtDOM(head, dom.focusOffset) : null;
    const model = editor.state.selection;
    return {
      text: dom?.toString(),
      anchorText: anchor?.textContent,
      headText: head?.textContent,
      anchorOffset: dom?.anchorOffset,
      headOffset: dom?.focusOffset,
      cell: anchor?.parentElement?.closest("td, th")?.getAttribute("headers") ?? null,
      aligned: domAnchor !== null && domHead !== null && domAnchor === model.anchor && domHead === model.head,
      focused: document.activeElement === element,
      domAnchor,
      domHead,
      modelAnchor: model.anchor,
      modelHead: model.head,
    };
  });
}

export async function selectEditorText(
  page: Page,
  body: Locator,
  keys: string[],
  expected: {
    text: string;
    anchorText: string;
    headText: string;
    anchorOffset: number;
    headOffset: number;
    cell: string | null;
  },
  target?: Locator,
) {
  await expect(body).toHaveAttribute("contenteditable", "true");
  // Retry only selection setup; the native paste and its content assertions run once.
  await expect
    .poll(async () => {
      if (target) await target.click();
      else await body.focus();
      for (const key of keys) {
        await page.keyboard.press(key);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      }
      return editorSelection(body);
    })
    .toMatchObject({ ...expected, aligned: true, focused: true });
}

export async function observePasteSelection(body: Locator) {
  await body.evaluate((element) => {
    const host = element as HTMLElement & { editor: Editor; pasteSelections?: unknown[] };
    host.pasteSelections = [];
    element.addEventListener(
      "paste",
      (event) => {
        const editor = host.editor;
        const dom = window.getSelection();
        const model = editor.state.selection;
        host.pasteSelections!.push({
          trusted: event.isTrusted,
          clipboard: (event as ClipboardEvent).clipboardData?.getData("text/html"),
          dom: dom && {
            anchor:
              dom.anchorNode && element.contains(dom.anchorNode)
                ? editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset)
                : null,
            head:
              dom.focusNode && element.contains(dom.focusNode)
                ? editor.view.posAtDOM(dom.focusNode, dom.focusOffset)
                : null,
            text: dom.toString(),
            anchorText: dom.anchorNode?.textContent,
            anchorOffset: dom.anchorOffset,
            headText: dom.focusNode?.textContent,
            headOffset: dom.focusOffset,
          },
          model: { from: model.from, to: model.to, text: editor.state.doc.textBetween(model.from, model.to) },
        });
      },
      { capture: true },
    );
  });
}

export async function signedIn(page: Page) {
  await page.context().addCookies([{ name: "a11y-user", value: "1", url: "http://127.0.0.1:4173" }]);
}

export async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  // Below `sm` the image setting lives in the header's menu, except in the minimal auth header.
  const menuButton = page.getByRole("button", { name: "Menu", exact: true });
  const phoneMenu = (page.viewportSize()?.width ?? 1280) < 640 && (await menuButton.count()) > 0;
  const trigger = phoneMenu ? menuButton : page.getByRole("button", { name: "Image display", exact: true });
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
