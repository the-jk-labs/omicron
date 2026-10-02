// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

vi.mock(import("$app/environment"), () => ({ browser: true, building: false, dev: true, version: "test" }));

let osDark = false;
let onOsChange: ((e: { matches: boolean }) => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  osDark = false;
  onOsChange = null;
  vi.stubGlobal(
    "matchMedia",
    vi.fn<(q: string) => MediaQueryList>(
      () =>
        ({
          get matches() {
            return osDark;
          },
          addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => (onOsChange = cb),
        }) as unknown as MediaQueryList,
    ),
  );
});

async function load() {
  vi.resetModules();
  return (await import("$lib/theme.svelte")).theme;
}

test("with nothing saved it follows the OS", async () => {
  osDark = true;
  const theme = await load();
  expect([theme.preference, theme.current]).toEqual(["system", "dark"]);
});

test("a saved choice wins over the OS; garbage is ignored", async () => {
  osDark = true;
  localStorage.setItem("theme", "light");
  expect((await load()).current).toBe("light");
  localStorage.setItem("theme", "sepia");
  expect((await load()).preference).toBe("system");
});

test("set persists and applies the class; toggle flips what is showing", async () => {
  const theme = await load();
  theme.set("dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  theme.toggle();
  expect([theme.preference, theme.current]).toEqual(["light", "light"]);
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  osDark = true;
  theme.set("system");
  expect(theme.current).toBe("dark");
});

test("an OS change is followed only while the preference is system", async () => {
  const theme = await load();
  onOsChange!({ matches: true });
  expect(theme.current).toBe("dark");
  theme.set("light");
  onOsChange!({ matches: true });
  expect(theme.current).toBe("light");
});

// BUG: like prefs.svelte.ts, the initial preference is read from localStorage
// while the module is imported, unguarded. With site data blocked, the getter
// throws and every page that imports the theme fails to hydrate.
test.fails("BUG: a browser that blocks storage still gets the system theme", async () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  expect((await load()).preference).toBe("system");
});
