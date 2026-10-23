// SPDX-License-Identifier: AGPL-3.0-or-later
type Payload = Record<string, unknown>;
type UmamiWindow = Window & { umami?: { track: (payload: (defaults: Payload) => Payload) => Promise<unknown> } };

export function publicPath(path: string): boolean {
  return (
    /^\/(?:about|contact|privacy|status)?$/.test(path) || /^\/(?:@[^/?#]+(?:\/[^/?#]+)?|tags\/[^/?#]+)$/.test(path)
  );
}

function optedOut(): boolean {
  if (
    navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
  )
    return true;
  try {
    return Boolean(localStorage.getItem("umami.disabled"));
  } catch {
    return false;
  }
}

export function createUmamiTracker() {
  const target = window as UmamiWindow;
  let script: HTMLScriptElement | null = null;
  let loading: Promise<void> | null = null;
  let loadedId: string | null = null;
  let lastKey: string | null = null;
  let revision = 0;

  function reset() {
    script?.remove();
    script = null;
    loading = null;
    loadedId = null;
    delete target.umami;
  }

  function load(id: string): Promise<void> {
    if (loadedId === id && loading) return loading;
    reset();
    loadedId = id;
    const element = document.createElement("script");
    script = element;
    element.src = "/api/site/script.js";
    element.defer = true;
    element.dataset.websiteId = id;
    element.dataset.hostUrl = `${location.origin}/api/site`;
    element.dataset.autoTrack = "false";
    element.dataset.doNotTrack = "true";
    element.dataset.excludeSearch = "true";
    element.dataset.excludeHash = "true";
    loading = new Promise<void>((resolve, reject) => {
      element.addEventListener("load", () => resolve(), { once: true });
      element.addEventListener("error", () => reject(new Error("Site statistics unavailable.")), { once: true });
      document.head.append(element);
    });
    return loading;
  }

  return {
    async track(id: string | null, url: Pick<URL, "origin" | "pathname">, referrer: string, allowed = true) {
      const current = ++revision;
      if (!id || !allowed || !publicPath(url.pathname) || optedOut()) {
        lastKey = null;
        if (!id) reset();
        return;
      }
      const key = `${id}:${url.pathname}`;
      if (lastKey === key) return;
      try {
        await load(id);
        if (current !== revision || optedOut()) return;
        let source = "";
        try {
          const parsed = referrer ? new URL(referrer, url.origin) : null;
          source = !parsed
            ? ""
            : parsed.origin === url.origin
              ? publicPath(parsed.pathname)
                ? parsed.pathname
                : ""
              : ["http:", "https:"].includes(parsed.protocol)
                ? parsed.origin
                : "";
        } catch {
          /* Invalid referrers are omitted. */
        }
        const client = target.umami;
        if (!client) throw new Error("Site statistics unavailable.");
        lastKey = key;
        await client.track((defaults) => ({ ...defaults, url: url.pathname, referrer: source }));
      } catch {
        // Statistics must never interfere with reading, including when blocked.
        if (current === revision) {
          lastKey = null;
          reset();
        }
      }
    },
    destroy() {
      revision++;
      reset();
    },
  };
}
