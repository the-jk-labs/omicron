<script lang="ts">
  import "../app.css";
  import { env } from "$env/dynamic/public";
  import Nav from "$lib/components/Nav.svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col bg-white text-neutral-900">
  <Nav user={data.user} />
  <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
    {@render children()}
  </main>
  <footer class="border-t border-neutral-200">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-neutral-500">
      <span>© {new Date().getFullYear()} {env.PUBLIC_APP_NAME || "Omicron"}</span>
      <span>A federated blog · powered by ActivityPub</span>
    </div>
  </footer>
</div>
