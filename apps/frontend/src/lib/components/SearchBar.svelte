<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Inline search pill for the top nav (`sm+`). Submitting navigates to
  `/search?q=…` — the page owns the actual results. The below-`sm` icon-only
  fallback lives in Nav.svelte so it can sit in the right-hand cluster.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";

  // Seed from the URL so the field reflects the active query on the results page.
  let query = $state(page.url.pathname === "/search" ? (page.url.searchParams.get("q") ?? "") : "");

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) goto(`/search?q=${encodeURIComponent(q)}`);
  }
</script>

<form onsubmit={submit} role="search">
  <div
    class="bg-muted/60 focus-within:bg-muted flex h-10 items-center gap-2.5 rounded-full px-3.5 transition-colors"
  >
    <Icon name="search" size={16} class="text-muted-foreground shrink-0" />
    <input
      bind:value={query}
      type="search"
      placeholder="Search"
      aria-label="Search articles and people"
      class="placeholder:text-muted-foreground w-40 bg-transparent text-sm outline-none md:w-48 lg:w-64"
    />
  </div>
</form>
