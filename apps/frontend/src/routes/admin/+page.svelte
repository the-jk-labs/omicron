<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { Tabs } from "bits-ui";
  import { untrack } from "svelte";
  import { ADMIN_TABS, type AdminTab, asAdminTab } from "#lib/adminTabs.js";
  import AdminDomains from "#lib/components/AdminDomains.svelte";
  import AdminEmail from "#lib/components/AdminEmail.svelte";
  import AdminInstanceSettings from "#lib/components/AdminInstanceSettings.svelte";
  import AdminReports from "#lib/components/AdminReports.svelte";
  import AdminSecurity from "#lib/components/AdminSecurity.svelte";
  import AdminSeo from "#lib/components/AdminSeo.svelte";
  import AdminUnsplash from "#lib/components/AdminUnsplash.svelte";
  import AdminUsers from "#lib/components/AdminUsers.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import InstanceModeration from "#lib/components/InstanceModeration.svelte";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import PageTabs from "#lib/components/ui/PageTabs.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Moderators share this dashboard but may only use Reports and Users —
  // every other tab stays visible yet gated, explaining it needs the admin
  // role (the server enforces the same boundary).
  const isAdmin = $derived(data.user.isAdmin);

  // Shallow: switching tabs updates ?tab= without rerunning the server load.
  let tab = $state<AdminTab>(untrack(() => data.tab));
  function selectTab(value: string) {
    tab = asAdminTab(value);
    replaceState(`?tab=${tab}`, {});
  }
  // Only the tab the page was opened on comes loaded; the others load themselves.
  const initial = untrack(() => data.initial);
</script>

{#snippet requiresAdmin(title: string)}
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
    <p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="lock" size={15} /> This tab requires the admin role. Your moderator account can use Reports and Users.
    </p>
  </section>
{/snippet}

<PageTitle text={isAdmin ? "Admin" : "Moderation"} />

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="gavel" size={22} />
    {isAdmin ? "Admin" : "Moderation"}
  </h1>
  <p class="mt-1 text-muted-foreground">
    {isAdmin ? "Moderation and instance-wide controls for this server." : "Reports queue and account moderation."}
  </p>
</header>

<Tabs.Root value={tab} onValueChange={selectTab}>
  <PageTabs tabs={ADMIN_TABS} />

  <Tabs.Content value="reports" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Moderation queue</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Reports filed by users. Remove content or suspend accounts, then resolve.
      </p>
      <div class="mt-5">
        <AdminReports initial={initial.reports} />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="users" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Users</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Every local account on this instance. Expand a row for detail; edit, suspend, delete, or change roles.
      </p>
      <div class="mt-5">
        <AdminUsers
          selfId={data.user.id}
          selfUsername={data.user.username}
          isViewerAdmin={isAdmin}
          initial={initial.users}
        />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="federation" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Defederation</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Block domains this instance won't federate with. Inbound activity is dropped, delivery skips them, and their
          content stops surfacing here.
        </p>
        <div class="mt-5">
          <AdminDomains initial={initial.domains} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Defederation")}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="email" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Email delivery</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          How this instance sends password-reset and verification mail. Configure and test it here. No config files.
        </p>
        <div class="mt-5">
          <AdminEmail initial={initial.email} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Email delivery")}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="security" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Security</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Defenses against automated abuse. Toggles apply live. No config files, no restart.
        </p>
        <div class="mt-5">
          <AdminSecurity initial={initial.security} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Security")}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="discoverability" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Discoverability</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Search-engine indexing, sitemap, and per-engine site verification. Applies live.
        </p>
        <div class="mt-5">
          <AdminSeo initial={initial.seo} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Discoverability")}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="media" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Photo search</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Writers can already search free, openly-licensed photos for a post banner. Openverse needs no setup. Add an
          Unsplash key here to offer their library as a second source.
        </p>
        <div class="mt-5">
          <AdminUnsplash initial={initial.unsplash} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Photo search")}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="settings" class="mt-6">
    {#if isAdmin}
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Instance identity</h2>
        <p class="mt-1 text-sm text-muted-foreground">The public name and domain for this server.</p>
        <div class="mt-5">
          <AdminInstanceSettings initial={initial.instance?.identity} />
        </div>
      </section>

      <section class="mt-6 rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Instance settings</h2>
        <p class="mt-1 text-sm text-muted-foreground">Settings that apply to everyone on this instance.</p>
        <div class="mt-5">
          <InstanceModeration initial={initial.instance?.settings} />
        </div>
      </section>
    {:else}
      {@render requiresAdmin("Instance identity")}
    {/if}
  </Tabs.Content>
</Tabs.Root>
