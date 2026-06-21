<script lang="ts">
  import "../app.css";
  import Nav from "$lib/components/Nav.svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<Nav user={data.user} />
<main class="mx-auto max-w-3xl px-4 py-8">
  {@render children()}
</main>
