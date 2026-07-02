<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import InstanceModeration from "$lib/components/InstanceModeration.svelte";
  import AdminInstanceSettings from "$lib/components/AdminInstanceSettings.svelte";
  import AdminEmail from "$lib/components/AdminEmail.svelte";
  import AdminUsers from "$lib/components/AdminUsers.svelte";
  import AdminReports from "$lib/components/AdminReports.svelte";
  import AdminDomains from "$lib/components/AdminDomains.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const tabs: { value: string; label: string; icon: IconName }[] = [
    { value: "reports", label: "Reports", icon: "flag" },
    { value: "users", label: "Users", icon: "users" },
    { value: "federation", label: "Federation", icon: "globe" },
    { value: "email", label: "Email", icon: "mail" },
    { value: "settings", label: "Instance", icon: "settings" },
  ];

  const triggerClass =
    "data-[state=active]:bg-background data-[state=active]:shadow-mini text-muted-foreground data-[state=active]:text-foreground inline-flex h-9 items-center gap-1.5 rounded-button px-4 text-sm font-medium";
</script>

<svelte:head><title>Admin · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="gavel" size={22} /> Admin
  </h1>
  <p class="mt-1 text-muted-foreground">
    Moderation and instance-wide controls for this server.
  </p>
</header>

<Tabs.Root value="reports">
  <Tabs.List
    class="inline-flex items-center gap-1 rounded-input border border-input bg-background-alt p-1 shadow-btn"
  >
    {#each tabs as t (t.value)}
      <Tabs.Trigger value={t.value} class={triggerClass}>
        <Icon name={t.icon} size={16} /> {t.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>

  <Tabs.Content value="reports" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Moderation queue</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Reports filed by users. Remove content or suspend accounts, then resolve.
      </p>
      <div class="mt-5">
        <AdminReports />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="users" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Users</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Every local account on this instance. Suspend to block sign-in.
      </p>
      <div class="mt-5">
        <AdminUsers selfId={data.user.id} />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="federation" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Defederation</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Block domains this instance won't federate with. Inbound activity is dropped, delivery
        skips them, and their content stops surfacing here.
      </p>
      <div class="mt-5">
        <AdminDomains />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="email" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Email delivery</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        How this instance sends password-reset and verification mail. Configure and test it here —
        no config files.
      </p>
      <div class="mt-5">
        <AdminEmail />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="settings" class="mt-6">
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Instance identity</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        The public name and domain for this server.
      </p>
      <div class="mt-5">
        <AdminInstanceSettings />
      </div>
    </section>

    <section class="mt-6 rounded-card border border-border bg-background p-6">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Instance settings</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Settings that apply to everyone on this instance.
      </p>
      <div class="mt-5">
        <InstanceModeration />
      </div>
    </section>
  </Tabs.Content>
</Tabs.Root>
