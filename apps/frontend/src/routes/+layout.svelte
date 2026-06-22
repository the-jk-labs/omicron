<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import Nav from "$lib/components/Nav.svelte";
  import SideNav from "$lib/components/SideNav.svelte";
  import Discover from "$lib/components/Discover.svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  // Site-wide social-share defaults. Pages may set their own <title>; these
  // provide the brand image/description used in link previews everywhere.
  const appName = $derived(env.PUBLIC_APP_NAME || "Omicron");
  const description =
    "A place to read, write, and connect — powered by ActivityPub. No lock-in, fully self-hostable.";
  const ogImage = $derived(`${$page.url.origin}/og-image.png`);
</script>

<svelte:head>
  <meta name="description" content={description} />
  <meta property="og:site_name" content={appName} />
  <meta property="og:title" content={appName} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={$page.url.href} />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={appName} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

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
      <div class="sticky top-20">
        <Discover />
      </div>
    </div>
  </div>
</div>
