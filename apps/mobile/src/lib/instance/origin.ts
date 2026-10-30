export const PRIMARY_INSTANCE = "https://omicron.blog";

// Plain HTTP is only for a backend on the developer's own machine or network.
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\]|[\w-]+\.local)$/i;

/** Turns what the user typed ("omicron.blog", "https://omicron.blog/@me") into an origin, or null. */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, "");
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.username || url.password || (!url.hostname.includes(".") && !LOCAL_HOST.test(url.hostname))) return null;
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOCAL_HOST.test(url.hostname)) return url.origin;
  return null;
}

/** The host shown in the UI, e.g. "omicron.blog". */
export const hostOf = (origin: string) => new URL(origin).host;

/** Resolves a root-relative media URL from the API against the instance. */
export function resolveUrl(origin: string, url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, origin).href;
  } catch {
    return undefined;
  }
}

/** External images go through the instance's proxy, as on the web, so the reader's IP isn't leaked. */
export function mediaUrl(origin: string, url: string | null | undefined): string | undefined {
  const resolved = resolveUrl(origin, url);
  if (!resolved || resolved.startsWith(`${origin}/`) || resolved.startsWith("data:")) return resolved;
  return `${origin}/api/media/proxy?url=${encodeURIComponent(resolved)}`;
}
