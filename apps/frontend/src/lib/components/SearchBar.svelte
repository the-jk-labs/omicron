<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Site search entry point in the top nav. On `sm+` it's an inline pill input;
  below `sm` it collapses to an icon button that links to the search page.
  Submitting navigates to `/search?q=…` — the page owns the actual results.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  // Seed from the URL so the field reflects the active query on the results page.
  let query = $state(page.url.pathname === "/search" ? (page.url.searchParams.get("q") ?? "") : "");

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) goto(`/search?q=${encodeURIComponent(q)}`);
  }
</script>

<!-- Inline pill (sm and up) -->
<form onsubmit={submit} role="search" class="hidden sm:block">
  <div
    class="rounded-input border-input bg-muted focus-within:border-foreground focus-within:bg-background flex h-10 items-center gap-2 border px-3 transition-colors"
  >
    <Icon name="search" size={16} class="text-muted-foreground shrink-0" />
    <input
      bind:value={query}
      type="search"
      placeholder="Search"
      aria-label="Search stories and people"
      class="placeholder:text-muted-foreground w-36 bg-transparent text-sm outline-none focus:w-48 md:w-48 md:focus:w-60"
    />
  </div>
</form>

<!-- Icon-only fallback (below sm) -->
<Button
  href="/search"
  variant="icon"
  class="!border-0 !shadow-none sm:hidden"
  aria-label="Search"
>
  <Icon name="search" size={18} />
</Button>
