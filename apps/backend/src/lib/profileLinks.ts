// SPDX-License-Identifier: AGPL-3.0-or-later
// Whitelist of platforms a profile link may belong to. The key drives the brand
// icon + label on the frontend; the backend only validates membership here.
export const LINK_PLATFORMS = [
  "website",
  "github",
  "gitlab",
  "mastodon",
  "pixelfed",
  "bluesky",
  "x",
  "instagram",
  "youtube",
  "linkedin",
  "letterboxd",
  "spotify",
  "matrix",
  "xmpp",
  "signal",
  "telegram",
  "irc",
  "custom",
] as const;

export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

const PLATFORM_SET = new Set<string>(LINK_PLATFORMS);

export const MAX_PROFILE_LINKS = 10;
export const MAX_LINK_URL_LEN = 2048;
export const MAX_LINK_LABEL_LEN = 60;

export function isLinkPlatform(value: unknown): value is LinkPlatform {
  return typeof value === "string" && PLATFORM_SET.has(value);
}

// Human label per platform, used as the field name when federating links as
// `PropertyValue` attachments (mirrors the frontend registry's labels).
const LINK_LABELS: Record<LinkPlatform, string> = {
  website: "Website",
  github: "GitHub",
  gitlab: "GitLab",
  mastodon: "Mastodon",
  pixelfed: "Pixelfed",
  bluesky: "Bluesky",
  x: "X",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  letterboxd: "Letterboxd",
  spotify: "Spotify",
  matrix: "Matrix",
  xmpp: "XMPP",
  signal: "Signal",
  telegram: "Telegram",
  irc: "IRC",
  custom: "Link",
};

export function linkLabel(platform: string, fallback = ""): string {
  return isLinkPlatform(platform) ? LINK_LABELS[platform] : (fallback || "Link");
}

// Compact, scheme-free anchor text for a link (e.g. "github.com/foo"); the full
// URL stays in the href. Mirrors the frontend's `linkSubtitle` for URL display.
export function linkDisplayText(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host.replace(/^www\./, "")}${path}${u.search}${u.hash}`;
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "").replace(/\/$/, "");
  }
}

// Coerces user input into a safe link URL, or null if it can't. Most platforms
// resolve to http(s); a few messaging platforms use their own URI scheme
// (XMPP `xmpp:`, IRC `irc(s)://`), which we accept but keep tightly bounded so
// only benign schemes are ever stored (never `javascript:`, `data:`, …).
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // XMPP JID: xmpp:user@server.tld
  if (/^xmpp:/i.test(trimmed)) {
    const jid = trimmed.slice(trimmed.indexOf(":") + 1);
    return /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(jid) ? `xmpp:${jid}` : null;
  }
  // IRC: irc://host[/channel] or ircs://…
  if (/^ircs?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return u.hostname.includes(".") ? u.toString() : null;
    } catch {
      return null;
    }
  }

  // Everything else is a web address; a bare "github.com/foo" gets https://.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}
