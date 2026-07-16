// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";
import { endpoints } from "$lib/api";

// Reactive unread-notification count for the nav bell badge. Polls the
// unread-count endpoint on an interval while a user is signed in, pausing when
// the tab is hidden and refreshing the moment it regains focus. `start`/`stop`
// are driven by the nav from the presence of a signed-in user; both idempotent.
const POLL_MS = 30_000;

class NotificationStore {
  /** Unread count shown on the bell badge. */
  count = $state(0);

  #timer: ReturnType<typeof setInterval> | null = null;
  #enabled = false;

  async refresh() {
    if (!browser || !this.#enabled) return;
    try {
      const { count } = await endpoints().unreadNotificationCount();
      this.count = count;
    } catch {
      // Transient failure (offline, 5xx) — leave the last count; next tick retries.
    }
  }

  start() {
    if (!browser || this.#enabled) return;
    this.#enabled = true;
    this.refresh();
    this.#timer = setInterval(() => {
      if (!document.hidden) this.refresh();
    }, POLL_MS);
    document.addEventListener("visibilitychange", this.#onVisible);
  }

  stop() {
    this.#enabled = false;
    this.count = 0;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (browser) document.removeEventListener("visibilitychange", this.#onVisible);
  }

  /** Optimistically clear the badge (dropdown opened, or page marked all read). */
  clear() {
    this.count = 0;
  }

  #onVisible = () => {
    if (browser && !document.hidden) this.refresh();
  };
}

export const notifications = new NotificationStore();
