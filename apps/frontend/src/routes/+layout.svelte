<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import Nav from "$lib/components/Nav.svelte";
  import SideNav from "$lib/components/SideNav.svelte";
  import MobileNav from "$lib/components/MobileNav.svelte";
  import Discover from "$lib/components/Discover.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import type { Post } from "$lib/types";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  // Site-wide social-share defaults. Pages may set their own <title>; these
  // provide the brand image/description used in link previews everywhere. The
  // name comes from the instance settings (wizard/admin), falling back to the
  // build-time env and then the default.
  const appName = $derived(data.instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const description =
    "A place to read, write, and connect — powered by ActivityPub. No lock-in, fully self-hostable.";
  const ogImage = $derived(`${$page.url.origin}/og-image.png`);

  // On a post page we emit article-specific Open Graph + the Mastodon
  // `fediverse:creator` tag, so shares render an author-attributed link card
  // ("More from <author>"). Driven from `page.data` here (one head block) to
  // avoid duplicate <meta> from a child <svelte:head>.
  const post = $derived(
    $page.route.id === "/[handle]/[slug]"
      ? ($page.data as { post?: Post }).post
      : undefined,
  );
  function excerpt(html: string): string {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
  }
  // A local author's handle resolves against this instance; a remote author's
  // `username` is already a `user@host` handle.
  const creator = $derived(
    post
      ? post.author.remote
        ? `@${post.author.username}`
        : `@${post.author.username}@${$page.url.host}`
      : null,
  );
  const ogTitle = $derived(post?.title || appName);
  const ogDescription = $derived(post ? excerpt(post.contentHtml) : description);
  const ogType = $derived(post ? "article" : "website");

  // The right discovery rail only belongs on the home feed and profile pages;
  // every other route (post, compose, settings, auth, …) hides it.
  const showDiscover = $derived(
    $page.route.id === "/" || $page.route.id === "/[handle]",
  );

  // Auth screens stand alone: no side rails, just the form centered in the
  // viewport. The shared chrome (rails, grid) only applies to in-app routes.
  const AUTH_ROUTES = new Set([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ]);
  const isAuth = $derived(AUTH_ROUTES.has($page.route.id ?? ""));
  // The first-run wizard is also a standalone screen (logo-only nav, no rails),
  // but a touch wider than the auth forms to fit the stepped layout.
  const isSetup = $derived($page.route.id === "/setup");
  const standalone = $derived(isAuth || isSetup);

  // Search-engine discoverability. Verification tokens become <meta> tags so an
  // operator can claim the site in each webmaster console; the engine → meta-name
  // map mirrors services/seo.ts on the backend.
  const VERIFICATION_META: Record<string, string> = {
    google: "google-site-verification",
    bing: "msvalidate.01",
    yandex: "yandex-verification",
  };
  const verificationTags = $derived(
    Object.entries(data.seo?.verification ?? {})
      .filter(([engine, token]) => VERIFICATION_META[engine] && token)
      .map(([engine, token]) => ({ name: VERIFICATION_META[engine], content: token as string })),
  );
  // Keep private/write-side routes out of the index even on a public instance,
  // and honour the admin's global indexing switch. Route prefixes cover nested
  // paths (e.g. /posts/[id]/edit under compose-like editing).
  const NOINDEX_PREFIXES = ["/compose", "/drafts", "/dashboard", "/settings", "/admin"];
  const noindex = $derived(
    data.seo?.indexingEnabled === false ||
      standalone ||
      NOINDEX_PREFIXES.some((p) => ($page.url.pathname ?? "").startsWith(p)),
  );
</script>

<svelte:head>
  <meta name="description" content={ogDescription} />
  <meta property="og:site_name" content={appName} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content={ogType} />
  <meta property="og:url" content={$page.url.href} />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={ogImage} />
  {#if post && creator}
    <!-- Mastodon link-preview author attribution. -->
    <meta name="fediverse:creator" content={creator} />
    <meta property="article:author" content={creator} />
  {/if}
  <!-- Search-engine site verification (admin-configured) -->
  {#each verificationTags as tag (tag.name)}
    <meta name={tag.name} content={tag.content} />
  {/each}
  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <Nav user={data.user} {appName} minimal={standalone} />

  {#if standalone}
    <!-- Auth / setup: single centered column, no rails. Fills the space under
         the nav so the content sits in the optical centre of the viewport. The
         wizard gets a wider column than the auth forms. -->
    <main
      class="mx-auto flex w-full flex-col justify-center px-4 py-12 sm:min-h-[calc(100vh-4rem)] sm:py-16 {isSetup
        ? 'max-w-xl'
        : 'max-w-sm'}"
    >
      {@render children()}
    </main>
  {:else}
    <div
      class="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-6 sm:py-8 lg:grid-cols-[180px_minmax(0,1fr)] {showDiscover
        ? 'xl:grid-cols-[180px_minmax(0,1fr)_260px]'
        : ''} {data.user ? 'pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-8' : ''}"
    >
      <!-- Left rail: primary navigation. Sticky offset (top-24) sits at the rail's
           natural position under the nav, so it pins from the first pixel of
           scroll — fixed, with no pre-pin drift. -->
      <div class="hidden lg:block">
        <div class="sticky top-24">
          <SideNav user={data.user} />
        </div>
      </div>

      <!-- Center: page content -->
      <main class="min-w-0">
        {@render children()}
      </main>

      <!-- Right rail: discovery (home feed and profile pages only) -->
      <div class={showDiscover ? "hidden xl:block" : "hidden"}>
        <div class="sticky top-24">
          <Discover data={data.discover} {appName} />
        </div>
      </div>
    </div>
  {/if}
</div>

{#if data.user}
  <MobileNav user={data.user} />
{/if}

<!-- Global host for the promise-based confirm() helper. -->
<ConfirmDialog />