<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Inline search pill for the top nav (`sm+`). Submitting navigates to
  `/search?q=…` — the page owns the actual results. The below-`sm` icon-only
  fallback lives in Nav.svelte so it can sit in the right-hand cluster.
  Keyboard: `/` or `Ctrl/⌘ K` focuses it (desktop); on narrow screens the
  shortcut jumps to `/search` where the field is visible.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import { onMount } from "svelte";

  // Seed from the URL so the field reflects the active query on the results page.
  let query = $state(page.url.pathname === "/search" ? (page.url.searchParams.get("q") ?? "") : "");
  let inputEl: HTMLInputElement | null = $state(null);

  // Keep the pill in sync when the query changes via navigation (back/forward).
  $effect(() => {
    if (page.url.pathname === "/search") {
      const q = page.url.searchParams.get("q") ?? "";
      // Don't overwrite live typing — only sync when the URL's q diverges from
      // what we already show, and the field isn't focused.
      if (q !== query && document.activeElement !== inputEl) query = q;
    } else if (query && page.url.pathname !== "/search") {
      // Leaving search clears the pill so it doesn't carry a stale query elsewhere.
      // Keep stale while focused to avoid fighting the user.
      if (document.activeElement !== inputEl) query = "";
    }
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) goto(`/search?q=${encodeURIComponent(q)}`);
    else if (page.url.pathname === "/search") goto("/search");
  }

  onMount(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // "/" — like GitHub / Mastodon. Only when not already typing.
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping) {
        e.preventDefault();
        if (window.innerWidth < 640) goto("/search");
        else inputEl?.focus();
        return;
      }
      // Ctrl+K / Cmd+K — like Slack / Linear.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.innerWidth < 640) goto("/search");
        else {
          inputEl?.focus();
          inputEl?.select();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
</script>

<form onsubmit={submit} role="search">
  <div
    class="flex h-10 items-center gap-2.5 rounded-full bg-muted/60 px-3.5 transition-colors focus-within:bg-muted has-[input:focus]:bg-muted"
  >
    <Icon name="search" size={16} class="shrink-0 text-muted-foreground" />
    <input
      bind:this={inputEl}
      bind:value={query}
      type="search"
      placeholder="Search"
      aria-label="Search articles and people"
      aria-keyshortcuts="/ Control+K Meta+K"
      class="w-40 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground md:w-48 lg:w-64"
    />
    <kbd
      class="hidden items-center gap-0.5 rounded-5px border border-border bg-background px-1.5 py-0.5 text-xs leading-none font-medium text-muted-foreground shadow-mini md:inline-flex"
      aria-hidden="true"
      title="Press / or ⌘K to search"
    >
      <span class="text-[11px]">/</span>
    </kbd>
  </div>
</form>
