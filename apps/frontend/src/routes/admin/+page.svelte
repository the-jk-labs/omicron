<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import InstanceModeration from "$lib/components/InstanceModeration.svelte";
  import Icon from "$lib/components/Icon.svelte";
</script>

<svelte:head><title>Admin · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="admin" size={22} /> Admin
  </h1>
  <p class="mt-1 text-muted-foreground">
    Moderation and instance-wide controls for this server.
  </p>
</header>

<div class="flex flex-col gap-8">
  <!-- Instance settings -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Instance settings</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Settings that apply to everyone on this instance.
    </p>

    <div class="mt-5">
      <InstanceModeration />
    </div>
  </section>
</div>
