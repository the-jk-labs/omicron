// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { deviceLabel, parseUserAgent } from "#lib/userAgent.js";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  firefoxIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

test.each([
  [UA.chromeWindows, "Chrome on Windows", false],
  [UA.edgeWindows, "Edge on Windows", false],
  [UA.operaMac, "Opera on macOS", false],
  [UA.firefoxLinux, "Firefox on Linux", false],
  [UA.safariMac, "Safari on macOS", false],
  [UA.safariIphone, "Safari on iOS", true],
  [UA.chromeIphone, "Chrome on iOS", true],
  [UA.firefoxIpad, "Firefox on iPadOS", true],
  [UA.samsungAndroid, "Samsung Internet on Android", true],
  [UA.chromeAndroid, "Chrome on Android", true],
  [UA.chromebook, "Chrome on ChromeOS", false],
])("%s reads as %s", (ua, label, mobile) => {
  const device = parseUserAgent(ua);
  expect(deviceLabel(device)).toBe(label);
  expect(device.mobile).toBe(mobile);
});

test("unknown or missing agents still get a label", () => {
  expect(deviceLabel(parseUserAgent(null))).toBe("Unknown device");
  expect(deviceLabel(parseUserAgent("curl/8.9.1"))).toBe("Unknown device");
  expect(deviceLabel(parseUserAgent("SomeApp/1.0 (Windows NT 10.0)"))).toBe("Windows");
});
