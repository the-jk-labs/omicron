// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";

// Reactive theme state. The initial `dark` class is applied pre-paint by the
// inline script in app.html; this keeps the toggle button in sync and persists
// explicit choices. With no stored choice, it follows the OS preference live.
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function initial(): Theme {
  if (!browser) return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

class ThemeState {
  current = $state<Theme>(initial());

  #apply(theme: Theme) {
    if (browser) document.documentElement.classList.toggle("dark", theme === "dark");
  }

  /** Explicit user choice — persisted. */
  set(theme: Theme) {
    this.current = theme;
    if (browser) localStorage.setItem(STORAGE_KEY, theme);
    this.#apply(theme);
  }

  toggle() {
    this.set(this.current === "dark" ? "light" : "dark");
  }

  /** OS-preference change — reflected but not persisted. */
  follow(theme: Theme) {
    this.current = theme;
    this.#apply(theme);
  }
}

export const theme = new ThemeState();

if (browser) {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) theme.follow(e.matches ? "dark" : "light");
    });
}