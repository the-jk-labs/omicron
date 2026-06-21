<script lang="ts">
  import "../app.css";
  import Nav from "$lib/components/Nav.svelte";
  import SideNav from "$lib/components/SideNav.svelte";
  import Discover from "$lib/components/Discover.svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<div class="min-h-screen bg-background text-foreground">
  <Nav user={data.user} />

  <div class="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_260px]">
    <!-- Left rail: primary navigation -->
    <div class="hidden lg:block">
      <div class="sticky top-20">
        <SideNav user={data.user} />
      </div>
    </div>

    <!-- Center: page content -->
    <main class="min-w-0">
      {@render children()}
    </main>

    <!-- Right rail: discovery -->
    <div class="hidden xl:block">
      <div class="sticky top-20 border-l border-border pl-8">
        <Discover />
      </div>
    </div>
  </div>
</div>
