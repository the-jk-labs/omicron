// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest stand-in for SvelteKit's virtual `$app/stores` module. `$lib/timezone`
// derives the render timezone from the `page` store, so it must be a real
// `Readable`; `UTC` matches the server's first-render fallback.
import { readable } from "svelte/store";

export const page = readable({ data: { timeZone: "UTC" } });
export const navigating = readable(null);
export const updated = readable({ current: false });
