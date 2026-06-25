// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";

// Reactive theme state. The initial `dark` class is applied pre-paint by the
// inline script in app.html; this keeps the UI in sync and persists the user's
// explicit choice. The user picks a *preference* — "light", "dark", or "system"
// — and `current` is the resolved theme actually applied to the document.
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "theme";
const mql = () => window.matchMedia("(prefers-color-scheme: dark)");

function osTheme(): Theme {
  return browser && mql().matches ? "dark" : "light";
}

function initialPreference(): ThemePreference {
  if (!browser) return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function resolve(pref: ThemePreference): Theme {
  return pref === "system" ? osTheme() : pref;
}

class ThemeState {
  /** The user's explicit choice. */
  preference = $state<ThemePreference>(initialPreference());
  /** The resolved theme applied to the document. */
  current = $state<Theme>(resolve(initialPreference()));

  #apply(theme: Theme) {
    this.current = theme;
    if (browser) document.documentElement.classList.toggle("dark", theme === "dark");
  }

  /** Set the preference — persisted — and apply the resolved theme. */
  set(pref: ThemePreference) {
    this.preference = pref;
    if (browser) localStorage.setItem(STORAGE_KEY, pref);
    this.#apply(resolve(pref));
  }

  /** Quick toggle (nav button): flip to the opposite of what's showing now. */
  toggle() {
    this.set(this.current === "dark" ? "light" : "dark");
  }

  /** OS-preference change while following "system" — reflected, not persisted. */
  follow(theme: Theme) {
    if (this.preference === "system") this.#apply(theme);
  }
}

export const theme = new ThemeState();

if (browser) {
  // When following the OS, reflect live changes to its preference.
  mql().addEventListener("change", (e) => theme.follow(e.matches ? "dark" : "light"));
}
