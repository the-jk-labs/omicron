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

  function syncTheme() {
    if (!picker) return;
    const dark = document.documentElement.classList.contains("dark");
    picker.classList.toggle("dark", dark);
    picker.classList.toggle("light", !dark);
  }

  onMount(async () => {
    await import("emoji-picker-element");
    picker = document.createElement("emoji-picker");
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
