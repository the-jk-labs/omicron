// SPDX-License-Identifier: AGPL-3.0-or-later
// localStorage that never throws. With site data blocked, even the `localStorage`
// getter throws a SecurityError, and a stored preference must never cost the page.

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value`, or removes the key when it is null. Silently skipped when blocked. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not persisted; the in-memory state still applies for this visit.
  }
}
