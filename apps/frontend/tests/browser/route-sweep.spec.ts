// SPDX-License-Identifier: AGPL-3.0-or-later
// Every route the fixture API can serve, as the role that reaches it: axe with contrast in both
// themes, reflow, text enlargement, and a whole keyboard pass. Passing here is evidence for these
// fixtures and this browser, not a WCAG result.
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { ADMIN_TABS } from "../../src/lib/adminTabs";

test.describe.configure({ retries: 0 });

type Role = "guest" | "user" | "admin";
const DRAFT = "9e962281-2222-3333-4444-555555555555";

const PAGES: [path: string, role: Role][] = [
  ["/", "guest"],
  ["/login", "guest"],
  ["/register", "guest"],
  ["/forgot-password", "guest"],
  ["/reset-password?token=fixture", "guest"],
  ["/verify-email", "guest"],
  ["/undo-email-change", "guest"],
  ["/about", "guest"],
  ["/contact", "guest"],
  ["/privacy", "guest"],
  ["/status", "guest"],
  ["/search?q=hello", "guest"],
  ["/@ada", "guest"],
  ["/@ada/hello-world", "guest"],
  ["/tags/design", "guest"],
  ["/lists/list-1", "guest"],
  ["/", "user"],
  ["/@ada/hello-world", "user"],
  ["/compose", "user"],
  [`/posts/${DRAFT}/edit`, "user"],
  ["/posts/manage", "user"],
  ["/dashboard", "user"],
  ["/lists", "user"],
  ["/lists/list-1", "user"],
  ["/notifications", "user"],
  ["/follow-requests", "user"],
  ["/settings", "user"],
  ...ADMIN_TABS.map(({ value }): [string, Role] => [`/admin?tab=${value}`, "admin"]),
];

async function open(page: Page, path: string, role: Role, extraCookies: string[] = []) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() === 501) failures.push(`Missing fixture: ${response.url()}`);
  });
  const names = [...extraCookies, ...(role === "admin" ? ["a11y-admin"] : role === "user" ? ["a11y-user"] : [])];
  await page.context().addCookies(names.map((name) => ({ name, value: "1", url: "http://127.0.0.1:4173" })));
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  return failures;
}

async function axeViolations(page: Page) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const engine = (window as typeof window & { axe: typeof axe }).axe;
    const result = await engine.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return result.violations
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
  });
  return violations;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// A constructed sheet, because the page's CSP refuses injected style tags.
const addCss = (page: Page, css: string) =>
  page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets.push(sheet);
  }, css);

const SPACING =
  "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }";

// Tabs through the page, recording what WCAG 2.1.2, 2.4.7 and 2.4.11 would fail on.
async function keyboardPass(page: Page) {
  const problems: string[] = [];
  let repeats = 0;
  for (let press = 0; press < 80; press++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      element.scrollIntoView({ block: "nearest" });
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const shown = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      const within = (x: number, y: number) => {
        const top = document.elementFromPoint(x, y);
        return !!top && (element === top || element.contains(top) || top.contains(element));
      };
      const covered =
        box.width > 0 &&
        box.height > 0 &&
        ![
          [box.left + box.width / 2, box.top + box.height / 2],
          [box.left + 2, box.top + 2],
          [box.right - 2, box.bottom - 2],
        ].some(([x, y]) => within(x, y));
      const label =
        element.getAttribute("aria-label") ?? element.innerText?.trim().slice(0, 40) ?? element.tagName.toLowerCase();
      const win = window as typeof window & { lastStop?: Element };
      const same = win.lastStop === element;
      win.lastStop = element;
      const name = element.getAttribute("aria-label") ?? element.id;
      return { same, label: `${element.tagName} "${label || name}"`, shown, covered };
    });
    if (!stop) break;
    if (!stop.shown) problems.push(`no visible focus: ${stop.label}`);
    if (stop.covered) problems.push(`focus obscured: ${stop.label}`);
    repeats = stop.same ? repeats + 1 : 0;
    if (repeats >= 3) {
      problems.push(`keyboard trap: ${stop.label}`);
      break;
    }
  }
  return problems;
}

for (const [path, role] of PAGES) {
  const name = `${role} ${path}`;

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} axe with contrast: ${name}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const failures = await open(page, path, role);
      expect(failures).toEqual([]);
      expect(await page.title()).not.toBe("");
      expect(await page.locator("html").getAttribute("lang")).toBeTruthy();
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test(`320px reflow with text spacing: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, path, role);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await addCss(page, SPACING);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test(`landscape and 200% text: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await open(page, path, role);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 800 });
    await addCss(page, "html { font-size: 200% !important; }");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test(`keyboard pass: ${name}`, async ({ page }) => {
    await open(page, path, role);
    expect(await keyboardPass(page)).toEqual([]);
  });

  test(`forced colours keyboard pass: ${name}`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, path, role);
    expect(await keyboardPass(page)).toEqual([]);
  });
}

test("an admin's logo and favicon replace the built-in ones", async ({ page }) => {
  await open(page, "/", "guest", ["a11y-branded"]);
  await expect(page.locator("header a img").first()).toHaveAttribute("src", "/api/uploads/chart.gif");
  const icons = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
  await expect(icons).toHaveCount(2);
  for (const icon of await icons.all()) await expect(icon).toHaveAttribute("href", /\/api\/uploads\/chart\.gif$/);
  expect(await axeViolations(page)).toEqual([]);
});

test("no custom favicon leaves the built-in icons alone", async ({ page }) => {
  await open(page, "/", "guest");
  await expect(page.locator('link[rel="icon"]')).toHaveCount(2);
  await expect(page.locator("link[data-instance-icon]")).toHaveCount(0);
});

// States a route sweep never opens by itself.
for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} open states`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    });

    test("the phone header menu", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await open(page, "/", "user");
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.click();
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test("the guest phone header menu", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await open(page, "/", "guest");
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Sign in" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("the account menu", async ({ page }) => {
      await open(page, "/", "admin");
      await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("the notification menu", async ({ page }) => {
      await open(page, "/", "user");
      await page.getByRole("button", { name: "Notifications", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "See all" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("an expanded user row in admin", async ({ page }) => {
      await open(page, "/admin?tab=users", "admin");
      await page.route("**/api/admin/users/author-2", (route) =>
        route.fulfill({
          json: {
            user: {
              id: "author-2",
              username: "bob",
              displayName: "Bob",
              bio: "",
              publicEmail: "",
              customSection: "",
              avatarUrl: null,
              isAdmin: false,
              isModerator: false,
              email: "bob@example.test",
              emailVerified: false,
              suspended: false,
              createdAt: "2026-01-01T12:00:00.000Z",
            },
            postCounts: { draft: 0, scheduled: 0, published: 1 },
            followCounts: { followers: 1, following: 1 },
            recentPosts: [],
            reports: [],
            tags: [],
            links: [],
          },
        }),
      );
      await page.getByRole("button", { name: "Show detail for @bob" }).click();
      await expect(page.getByRole("button", { name: "Send password reset" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });

    test("the passkey prompt, which opens by itself and takes focus", async ({ page }) => {
      await page.route("**/api/auth/passkey/list-user-passkeys", (route) => route.fulfill({ json: [] }));
      await open(page, "/", "user");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByRole("button", { name: "Not now" })).toBeFocused();
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("an invite-only register page", async ({ page }) => {
      await open(page, "/register", "guest", ["a11y-invite-only"]);
      await expect(page.getByRole("heading", { name: /invite-only/ })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}
