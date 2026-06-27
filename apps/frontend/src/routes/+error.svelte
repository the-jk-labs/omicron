<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";

  // Shared error screen for every status SvelteKit throws our way. 404 is the
  // common case and gets bespoke copy; anything else falls back to a generic
  // message while keeping the same layout and brand mark.
  const status = $derived($page.status);
  const isNotFound = $derived(status === 404);

  const heading = $derived(isNotFound ? "Page not found" : "Something went wrong");
  const blurb = $derived(
    isNotFound
      ? "The page you’re looking for doesn’t exist, was moved, or never made it across the fediverse."
      : $page.error?.message || "An unexpected error occurred. Please try again.",
  );
</script>

<svelte:head><title>{status} · {heading}</title></svelte:head>

<section
  class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center"
>
  <!-- The mascot — a rabbit down a rabbit hole — keeps the page recognisably
       ours even when there's nothing here. -->
  <img
    src="/favicon.svg"
    alt="Omicron rabbit mascot peering out of its hole"
    width="96"
    height="96"
    class="mb-6 size-24"
  />

  <p class="text-muted-foreground text-sm font-semibold tracking-widest">
    ERROR {status}
  </p>
  <h1 class="text-foreground mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
    {heading}
  </h1>
  <p class="text-muted-foreground mt-3 text-base leading-relaxed">
    {blurb}
  </p>

  <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
    <Button href="/" variant="solid">
      <Icon name="home" size={16} /> Back home
    </Button>
    <Button href="/search" variant="outline">
      <Icon name="search" size={16} /> Search
    </Button>
  </div>
</section>
