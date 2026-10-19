// SPDX-License-Identifier: AGPL-3.0-or-later
export type IdentityConsent = {
  ticket: string;
  name: string;
  callbackOrigin: string;
  username: string;
  scope: string;
};

export type IdentityConnection = {
  id: string;
  name: string;
  callbackOrigin: string;
  createdAt: string;
  expiresAt: string;
};

// Login only resumes this local flow, never an arbitrary return URL.
export function oauthReturnTo(value: string | null): string {
  // oxlint-disable-next-line no-control-regex
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid" &&
      value.startsWith("/oauth/authorize?") &&
      url.pathname === "/oauth/authorize"
      ? url.pathname + url.search
      : "/";
  } catch {
    return "/";
  }
}
