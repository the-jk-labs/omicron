// SPDX-License-Identifier: AGPL-3.0-or-later
// `$app/forms` needs a running SvelteKit client; browser tests cover what `enhance` does.
export function enhance() {
  return { destroy() {} };
}
