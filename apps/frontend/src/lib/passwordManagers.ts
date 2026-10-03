// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Spread onto an input that only looks like a login field (an email or a
 * username that isn't the reader's own credentials), so password managers
 * don't offer to fill it. They ignore `autocomplete="off"`; each has its own
 * opt-out: 1Password, LastPass, Bitwarden and Dashlane, in that order.
 */
export const notALoginField = {
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-bwignore": "",
  "data-form-type": "other",
} as const;
