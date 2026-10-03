// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";

vi.mock(import("$app/env"), () => ({ browser: true, building: false, dev: true, version: "test" }));

import { rememberTimeZone, timeZone, TZ_COOKIE, validTimeZone } from "#lib/timezone.svelte.js";

test.for(["UTC", "Asia/Baku", "America/Argentina/Buenos_Aires"])("%s is a valid zone", (zone) => {
  expect(validTimeZone(zone)).toBe(zone);
});

test.for([undefined, "", "Mars/Olympus", "<script>"])("%o is dropped", (zone) => {
  expect(validTimeZone(zone)).toBe(null);
});

test("the value starts from the page's zone and switches to the browser's once remembered", () => {
  // The $app/state stand-in carries no zone, so this is the server's UTC fallback.
  expect(timeZone.current).toBe("UTC");
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "Asia/Baku",
  } as Intl.ResolvedDateTimeFormatOptions);
  rememberTimeZone();
  expect(timeZone.current).toBe("Asia/Baku");
  expect(document.cookie).toContain(`${TZ_COOKIE}=Asia%2FBaku`);
});
