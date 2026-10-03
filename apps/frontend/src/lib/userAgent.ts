// SPDX-License-Identifier: AGPL-3.0-or-later

export type Device = { browser: string | null; os: string | null; mobile: boolean };

// Order matters: Edge, Opera and Samsung Internet all also claim to be Chrome,
// and Chrome claims to be Safari.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\/|\bChromium\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPadOS 13+ asks for desktop pages, so an iPad usually reads as a Mac.
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone|\biPod/, "iOS"],
  [/\biPad/, "iPadOS"],
  [/\bAndroid/, "Android"],
  [/\bWindows NT/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh|\bMac OS X/, "macOS"],
  [/\bLinux/, "Linux"],
];

/** Best-effort browser and system from a User-Agent header, for labelling a session. */
export function parseUserAgent(ua: string | null | undefined): Device {
  const value = ua ?? "";
  const os = SYSTEMS.find(([re]) => re.test(value))?.[1] ?? null;
  return {
    browser: BROWSERS.find(([re]) => re.test(value))?.[1] ?? null,
    os,
    mobile: os === "iOS" || os === "iPadOS" || os === "Android" || /\bMobi/.test(value),
  };
}

/** "Chrome on Windows", or as much of it as is known. */
export function deviceLabel({ browser, os }: Device): string {
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}
