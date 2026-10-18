<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  // Thin wrapper around `emoji-picker-element` (a framework-agnostic web
  // component). It's imported client-side only — the custom element touches
  // `window`/`customElements`, so it must never run during SSR. The picker
  // inserts plain Unicode emoji; rendering them as Twemoji is handled globally
  // by the unicode-range font (see app.css), including inside this picker via
  // `--emoji-font-family: "Twemoji"`.
  let { onPick }: { onPick: (emoji: string) => void } = $props();

  let host = $state<HTMLDivElement | null>(null);
  let picker: HTMLElement | null = null;
  let themeObserver: MutationObserver | null = null;
  let styleObserver: MutationObserver | null = null;

  function syncTheme() {
    if (!picker) return;
    const dark = document.documentElement.classList.contains("dark");
    picker.classList.toggle("dark", dark);
    picker.classList.toggle("light", !dark);
  }

  // The element styles itself with a nonce-less <style> in its shadow root, which
  // the CSP blocks; the same CSS as an adopted (CSSOM) stylesheet is allowed.
  function adoptShadowStyles(element: HTMLElement) {
    const root = element.shadowRoot;
    if (!root) return;
    root.adoptedStyleSheets = [...root.querySelectorAll("style")].map((style) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(style.textContent ?? "");
      style.remove();
      return sheet;
    });
  }

  // Its layout also rides on runtime style attributes (tab count, row counts,
  // indicator offset), which `style-src-attr` blocks; CSSOM writes are allowed.
  function mirrorInlineStyles(root: ShadowRoot): MutationObserver {
    const applied = new WeakMap<Element, string>();
    const apply = (el: Element) => {
      const value = el.getAttribute("style");
      if (value === null || applied.get(el) === value) return;
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
      el.style.cssText = value;
      // Our own write re-serializes the attribute; remembering it stops the observer looping.
      applied.set(el, el.getAttribute("style") ?? "");
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") apply(record.target as Element);
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          apply(node);
          node.querySelectorAll("[style]").forEach(apply);
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    root.querySelectorAll("[style]").forEach(apply);
    return observer;
  }

  onMount(async () => {
    await import("emoji-picker-element");
    picker = document.createElement("emoji-picker");
    adoptShadowStyles(picker);
    if (picker.shadowRoot) styleObserver = mirrorInlineStyles(picker.shadowRoot);
    // Self-hosted dataset (no third-party CDN) and pinned to the font's emoji
    // version so the picker never offers glyphs the Twemoji font can't draw.
    picker.setAttribute("data-source", "/emoji-data.json");
    picker.setAttribute("emoji-version", "15.0");
    picker.className = "omicron-emoji-picker";
    picker.addEventListener("emoji-click", (e) => {
      const detail = (e as CustomEvent<{ unicode?: string }>).detail;
      if (detail.unicode) onPick(detail.unicode);
    });
    host?.appendChild(picker);

    syncTheme();
    themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  onDestroy(() => {
    themeObserver?.disconnect();
    styleObserver?.disconnect();
    picker?.remove();
  });
</script>

<div bind:this={host}></div>

<!-- emoji-picker-element exposes its internals through CSS custom properties
     that pierce its shadow DOM, so we map them to the Bits UI theme tokens. -->
<style>
  :global(.omicron-emoji-picker) {
    --background: hsl(var(--background));
    --border-color: hsl(var(--border-card));
    --border-size: 1px;
    --indicator-color: hsl(var(--foreground));
    --input-border-color: hsl(var(--border-input));
    --input-font-color: hsl(var(--foreground));
    --input-placeholder-color: hsl(var(--muted-foreground));
    --outline-color: hsl(var(--foreground));
    --category-font-color: hsl(var(--muted-foreground));
    --button-active-background: hsl(var(--muted));
    --button-hover-background: hsl(var(--muted));
    --emoji-font-family: "Twemoji";
    --num-columns: 8;
    --emoji-size: 1.375rem;
    width: 100%;
    height: 22rem;
  }
</style>
