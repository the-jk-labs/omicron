import { createStore } from "@/lib/store";

// Web paths the app opens itself; the Android intent filter in app.config.ts claims the same set.
const IN_APP = [/^\/@[^/]+$/, /^\/@[^/]+\/[^/]+$/, /^\/tags\/[^/]+$/, /^\/lists\/[^/]+$/];
const INSTANCE_PAGES: Record<string, string> = { "/about": "/instance/about", "/privacy": "/instance/privacy" };

export type LinkTarget = { kind: "app"; path: string } | { kind: "browser"; url: string };

/**
 * Where an incoming link should open. An https link opens in the app only when it points at the instance the app
 * is connected to and at a page the app has; anything else (another instance, feeds, settings) goes to the
 * browser, so content is never shown against the wrong server. App-scheme links pass through untouched.
 */
export function resolveIncomingLink(link: string, instanceOrigin: string | null): LinkTarget {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { kind: "app", path: link };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "app", path: link };

  const sameInstance = instanceOrigin !== null && new URL(instanceOrigin).host === url.host;
  const path = decodeURI(url.pathname).replace(/\/+$/, "") || "/";
  if (sameInstance) {
    const page = INSTANCE_PAGES[path];
    if (page) return { kind: "app", path: page };
    if (!path.endsWith(".xml") && IN_APP.some((pattern) => pattern.test(path))) {
      return { kind: "app", path: `${encodeURI(path)}${url.search}` };
    }
  }
  return { kind: "browser", url: url.href };
}

/** A link that arrived before any instance was chosen, opened once one is. */
export const pendingLink = createStore<string | null>(null);

// Android can hand a verified link straight back from the browser tab it was sent to; that's no new tap.
const BOUNCE_MS = 5_000;
const sentToBrowser = new Map<string, number>();

export const forgetBrowserLinks = () => sentToBrowser.clear();

/** Where `redirectSystemPath` routes an incoming link, plus a URL to open in the browser when it isn't ours. */
export function routeIncomingLink(
  link: string,
  instanceOrigin: string | null,
  now = Date.now(),
): { path: string; browser?: string } {
  const target = resolveIncomingLink(link, instanceOrigin);
  if (target.kind === "app") return { path: target.path };
  if (instanceOrigin === null) {
    pendingLink.set(target.url);
    return { path: "/welcome" };
  }
  const sent = sentToBrowser.get(target.url);
  if (sent !== undefined && now - sent < BOUNCE_MS) return { path: "/" };
  sentToBrowser.set(target.url, now);
  return { path: "/", browser: target.url };
}
