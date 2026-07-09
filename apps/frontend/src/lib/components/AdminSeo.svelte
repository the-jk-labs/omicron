<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import type { SeoSettings, SeoVerification } from "$lib/types";

  // Discoverability controls (services/seo.ts). Two things: the master indexing
  // switch (drives robots.txt + a site-wide noindex) and per-engine
  // site-verification tokens rendered as <meta> tags in the app's <head>.
  let indexingEnabled = $state(true);
  let verification = $state<SeoVerification>({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);

  // The engines we expose a field for, with where to get the token. The token is
  // just the meta `content` value — not the whole tag; we build the tag.
  const engines: { key: keyof SeoVerification; label: string; consoleUrl: string; hint: string }[] = [
    {
      key: "bing",
      label: "Bing Webmaster Tools",
      consoleUrl: "https://www.bing.com/webmasters",
      hint: "The content value of the msvalidate.01 meta tag (also feeds DuckDuckGo, Ecosia, Yahoo).",
    },
    {
      key: "google",
      label: "Google Search Console",
      consoleUrl: "https://search.google.com/search-console",
      hint: "The content value of the google-site-verification meta tag.",
    },
    {
      key: "yandex",
      label: "Yandex Webmaster",
      consoleUrl: "https://webmaster.yandex.com",
      hint: "The content value of the yandex-verification meta tag.",
    },
  ];

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  function apply(s: SeoSettings) {
    indexingEnabled = s.indexingEnabled;
    verification = { ...s.verification };
  }

  $effect(() => {
    endpoints()
      .adminSeo()
      .then(apply)
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  async function save() {
    saving = true;
    error = "";
    saved = false;
    try {
      apply(await endpoints().setAdminSeo({ indexingEnabled, verification }));
      saved = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <!-- Master indexing switch -->
  <div class="flex items-start justify-between gap-4">
    <div class="flex flex-col gap-1">
      <Label.Root for="seo-indexing" class="text-sm font-medium text-foreground">
        Allow search-engine indexing
      </Label.Root>
      <p class="max-w-prose text-sm text-muted-foreground">
        When on, this instance serves a permissive <code class="text-foreground-alt">robots.txt</code>
        and a <code class="text-foreground-alt">sitemap.xml</code> of published posts, so search
        engines can find and list your content. Turn it off to keep the instance out of search
        results entirely (emits <code class="text-foreground-alt">noindex</code> everywhere). Private
        areas — settings, drafts, the dashboard, admin — are never indexed either way.
      </p>
    </div>
    <Switch.Root
      id="seo-indexing"
      bind:checked={indexingEnabled}
      disabled={loading || saving}
      class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
    >
      <Switch.Thumb
        class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
      />
    </Switch.Root>
  </div>

  <!-- Per-engine site verification -->
  <div class="flex flex-col gap-4 border-t border-border pt-5">
    <div>
      <h3 class="text-sm font-semibold text-foreground">Search-engine verification</h3>
      <p class="mt-0.5 max-w-prose text-sm text-muted-foreground">
        Paste the verification token from each search console to claim this site. We add the
        matching <code class="text-foreground-alt">&lt;meta&gt;</code> tag to every page's head — pick
        the “HTML meta tag” method in the console, then copy just the token. For a site behind the
        AI-scraper shield, the console's DNS/CNAME method is the most reliable and needs nothing here.
      </p>
    </div>

    {#each engines as engine (engine.key)}
      <div class="flex flex-col gap-1.5">
        <Label.Root for={`seo-${engine.key}`} class={labelClass}>{engine.label}</Label.Root>
        <input
          id={`seo-${engine.key}`}
          bind:value={verification[engine.key]}
          autocomplete="off"
          spellcheck="false"
          placeholder="Verification token"
          class={field}
        />
        <p class="text-xs text-muted-foreground">
          {engine.hint}
          <a href={engine.consoleUrl} target="_blank" rel="noreferrer noopener" class="text-foreground underline underline-offset-2">
            Open console
          </a>
        </p>
      </div>
    {/each}
  </div>

  <div class="flex items-center gap-3 border-t border-border pt-5">
    <Button type="button" variant="solid" class="h-11" disabled={loading || saving} onclick={save}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
    {#if saved}<span class="text-sm text-muted-foreground">Saved.</span>{/if}
    <a href="/robots.txt" target="_blank" rel="noreferrer" class="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">robots.txt</a>
    <a href="/sitemap.xml" target="_blank" rel="noreferrer" class="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">sitemap.xml</a>
  </div>
  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
</div>
