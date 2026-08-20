<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import { canonicalOrigin } from "$lib/canonical";
  import Discover from "$lib/components/Discover.svelte";
  import MobileNav from "$lib/components/MobileNav.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import SideNav from "$lib/components/SideNav.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { absoluteBanner, postCardUrl } from "$lib/cover";
  import { excerpt } from "$lib/format";
  import { blogPostingLd, breadcrumbLd, profilePageLd, serializeJsonLd, webSiteLd } from "$lib/seo";
  import { rememberTimeZone } from "$lib/timezone";
  import type { Post, Profile, ReadingList } from "$lib/types";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  // Hand the reader's timezone to the server for the *next* render, and switch
  // this one over to it now that we're past hydration. On every visit but the
  // very first the cookie is already there and this changes nothing on screen —
  // which is the point: no timestamp flipping hours after the page paints.
  $effect(() => {
    rememberTimeZone();
  });

  // Site-wide social-share defaults. Pages may set their own <title>; these
  // provide the brand image/description used in link previews everywhere. The
  // name comes from the instance settings (wizard/admin), falling back to the
  // build-time env and then the default.
  const appName = $derived(data.instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const description = "A place to read, write, and connect — powered by ActivityPub. No lock-in, fully self-hostable.";
  // Every absolute URL we publish — the canonical link, og:url, the share image
  // — is built on the instance's configured origin rather than the hostname this
  // request happened to arrive on, so an article has one address wherever it is
  // read from. Falls back to the request origin when no domain is configured
  // (a fresh local instance), which is then the only origin there is.
  const origin = $derived(canonicalOrigin(data.instance?.domain) ?? $page.url.origin);
  // Query strings are tracking noise, never a distinct page here, so the
  // canonical URL is the path alone.
  const canonical = $derived(`${origin}${$page.url.pathname}`);
  const ogImage = $derived(`${origin}/og-image.png`);

  // On a post page we emit article-specific Open Graph + the Mastodon
  // `fediverse:creator` tag, so shares render an author-attributed link card
  // ("More from <author>"). Driven from `page.data` here (one head block) to
  // avoid duplicate <meta> from a child <svelte:head>.
  const post = $derived($page.route.id === "/[handle]/[slug]" ? ($page.data as { post?: Post }).post : undefined);
  // Shared with the feed cards, so a link preview and the card describe a post
  // the same way — decoded entities included.
  const ogExcerpt = (html: string) => excerpt(html, 199);
  // A local author's handle resolves against this instance; a remote author's
  // `username` is already a `user@host` handle.
  const creator = $derived(
    post ? (post.author.remote ? `@${post.author.username}` : `@${post.author.username}@${$page.url.host}`) : null,
  );
  const ogTitle = $derived(post?.title || appName);
  // An ingested post carries the sender's own `description`; prefer it over a
  // clipped body, which is only ever a stand-in for one.
  const ogDescription = $derived(post ? post.summary?.trim() || ogExcerpt(post.contentHtml) : description);
  const ogType = $derived(post ? "article" : "website");
  // A post's banner becomes its share image, falling back to the instance's
  // brand image. `bannerUrl` rather than `coverUrl`, so a post whose banner is
  // simply its first picture still gets a picture on the link card instead of
  // the generic brand tile.
  //
  // Resolved against the canonical origin because a banner uploaded here is
  // stored root-relative (`/api/uploads/…`) and a scraper would resolve that
  // against itself. An unparseable URL falls back rather than emitting a broken
  // og:image.
  const shareImage = $derived(absoluteBanner(post?.bannerUrl, origin) ?? postCardUrl(post, origin) ?? ogImage);

  // RSS auto-discovery: a reader pointed at a profile, an article or a
  // reading-list page finds the feed from this tag alone — which is how Feedly,
  // Inoreader, Miniflux and NetNewsWire subscribe, none of them running the
  // JavaScript that would reveal the link any other way. Local authors only (a
  // remote actor's posts are syndicated by their own instance) and public lists
  // only (a private list's feed 404s for the anonymous reader that would fetch
  // it). Skipped when the admin has indexing off, since the feed serves nothing
  // then.
  const feedLink = $derived.by(() => {
    if (data.seo?.indexingEnabled === false) return null;
    const pageData = $page.data as { remote?: boolean; profile?: Profile; list?: ReadingList };
    const href = `${$page.url.pathname}/feed.xml`;
    if ($page.route.id === "/[handle]" && !pageData.remote && pageData.profile) {
      return { href, title: `${pageData.profile.user.displayName} · ${appName}` };
    }
    if ($page.route.id === "/lists/[id]" && pageData.list?.visibility === "public") {
      return { href, title: `${pageData.list.title} · ${appName}` };
    }
    // An article advertises its author's feed, not a feed of its own: paste the
    // URL you are reading into a feed reader and you subscribe to the writer,
    // which is the only feed that exists. Not `href` above — that would append
    // /feed.xml to the article's own path.
    if (post && !post.remote) {
      return {
        href: `/@${post.author.username}/feed.xml`,
        title: `${post.author.displayName} · ${appName}`,
      };
    }
    return null;
  });

  // ActivityPub autodiscovery on a profile page: the machine-readable twin of
  // the RSS link above, and the other half of the negotiation in
  // hooks.server.ts. A fediverse client that fetched this page as HTML — because
  // it did not think to ask for JSON-LD, or followed a link that landed here —
  // finds the actor from this tag rather than giving up on the handle.
  //
  // Local profiles only (a remote actor is served by its own instance, and this
  // page is a cached copy), and only while the backend is federating, since
  // /users/<name> is a 404 otherwise.
  const actorLink = $derived.by(() => {
    if (!data.instance?.federationEnabled) return null;
    const pageData = $page.data as { remote?: boolean; profile?: Profile };
    if ($page.route.id !== "/[handle]" || pageData.remote || !pageData.profile) return null;
    return `${origin}/users/${pageData.profile.user.username}`;
  });

  // The right discovery rail only belongs on the home feed and profile pages;
  // every other route (post, compose, settings, auth, …) hides it.
  const showDiscover = $derived($page.route.id === "/" || $page.route.id === "/[handle]");

  // Auth screens stand alone: no side rails, just the form centered in the
  // viewport. The shared chrome (rails, grid) only applies to in-app routes.
  const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"]);
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
  // Kept in step with the DISALLOW list in routes/robots.txt. The two overlap
  // on purpose and cover different failures: robots.txt stops a well-behaved
  // crawler spending fetches here at all, while this catches one that ignores
  // it, or that arrived from an external link rather than by crawling us.
  const NOINDEX_PREFIXES = [
    "/compose",
    "/drafts",
    // Deliberately the full segment, not "/posts": this is a prefix list, and
    // "/posts" would take every published article out of the index with it.
    "/posts/manage",
    "/dashboard",
    "/settings",
    "/admin",
    "/search",
    "/notifications",
    "/follow-requests",
  ];
  const noindex = $derived(
    data.seo?.indexingEnabled === false ||
      standalone ||
      NOINDEX_PREFIXES.some((p) => ($page.url.pathname ?? "").startsWith(p)),
  );

  // Pages that render content this instance caches but did not publish: a
  // federated post, and the cached profile of the remote author who wrote it.
  // Both reproduce another instance's words at a URL on our domain, so each one
  // is a duplicate of a page that already exists elsewhere.
  //
  // That has to stay out of the index, and not only because a duplicate ranks
  // badly on its own. An instance federating well holds far more remote posts
  // than local ones, so left indexable the *majority* of what a search engine
  // sees here is text it has already found at its source — the signature of a
  // scraper site, and a judgement that lands on the whole domain rather than
  // just the copies. The instance's own writers pay for it.
  //
  // `follow`, not `nofollow`: these pages link on to local posts and profiles
  // that do belong in the index, and dropping the copy shouldn't drop the trail
  // to them. The sitemap already lists local posts only (backend
  // repositories/posts.ts listSitemapEntries), so this closes the other half —
  // what a crawler reaches by following links from the feed.
  const federated = $derived(
    ($page.route.id === "/[handle]/[slug]" && post?.remote === true) ||
      ($page.route.id === "/[handle]" && ($page.data as { remote?: boolean }).remote === true),
  );

  const robots = $derived(noindex ? "noindex, nofollow" : federated ? "noindex, follow" : null);

  // Schema.org description of what this page is (see $lib/seo). Built here for
  // the same reason the Open Graph block is: one head, so a child route can't
  // emit a second, conflicting copy.
  //
  // Skipped entirely on anything already marked noindex — a federated copy, a
  // private route, an instance with indexing switched off. Describing a page in
  // machine-readable detail and then asking for it not to be indexed are
  // contradictory instructions, and the first is wasted work regardless.
  const jsonLd = $derived.by(() => {
    if (robots) return null;
    const site = { origin, appName, instance: data.instance };
    if (post) {
      // Two documents: what the article is, and where the page sits. Emitted
      // as an array, which is how JSON-LD carries more than one subject in a
      // single block.
      return [
        blogPostingLd(post, {
          canonical,
          description: ogDescription,
          image: shareImage,
          site,
        }),
        breadcrumbLd(post, { canonical, site }),
      ];
    }
    const pageData = $page.data as { remote?: boolean; profile?: Profile };
    if ($page.route.id === "/[handle]" && !pageData.remote && pageData.profile) {
      return profilePageLd(pageData.profile, { canonical, site });
    }
    if ($page.route.id === "/") return webSiteLd({ description, site });
    return null;
  });
</script>

<svelte:head>
  <!-- Omitted on a federated copy: a canonical tag is this page asserting it is
       the original, which for someone else's article is simply false. The
       `noindex` below is the instruction that matters, and Google treats a
       canonical alongside it as a contradiction to resolve rather than a hint
       to follow. -->
  {#if !federated}
    <link rel="canonical" href={canonical} />
  {/if}
  <meta name="description" content={ogDescription} />
  <meta property="og:site_name" content={appName} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content={ogType} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={shareImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={shareImage} />
  {#if post}
    <!-- Article facts for consumers that read Open Graph rather than the
         JSON-LD below: the fediverse (Mastodon shows the author line from
         these), and the several link-preview services that never parse
         schema.org. Duplicated on purpose — the two vocabularies have
         different audiences. -->
    <meta property="article:published_time" content={post.createdAt} />
    {#each post.tags ?? [] as tag (tag.slug)}
      <meta property="article:tag" content={tag.name} />
    {/each}
    {#if creator}
      <!-- Mastodon link-preview author attribution. -->
      <meta name="fediverse:creator" content={creator} />
      <meta property="article:author" content={creator} />
    {/if}
  {/if}
  <!-- Screen readers reach a shared link through the card, not the page. -->
  <meta property="og:image:alt" content={post?.title ?? appName} />
  {#if feedLink}
    <link rel="alternate" type="application/rss+xml" title={feedLink.title} href={feedLink.href} />
  {/if}
  {#if actorLink}
    <link rel="alternate" type="application/activity+json" href={actorLink} />
  {/if}
  <!-- Search-engine site verification (admin-configured) -->
  {#each verificationTags as tag (tag.name)}
    <meta name={tag.name} content={tag.content} />
  {/each}
  {#if robots}
    <meta name="robots" content={robots} />
  {/if}
  {#if jsonLd}
    <!-- A `application/ld+json` block is data, not code: the browser never runs
         it, so `script-src 'self'` (svelte.config.js) does not apply and it
         needs no nonce. Its contents are escaped in $lib/seo — a post title can
         come from another instance and must not be able to close this tag. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html `<script type="application/ld+json">${serializeJsonLd(jsonLd)}<\/script>`}
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
          <SideNav user={data.user} {appName} instance={data.instance} />
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
