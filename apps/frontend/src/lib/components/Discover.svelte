<script lang="ts">
  import { env } from "$env/dynamic/public";
  import { Separator } from "bits-ui";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User | null } = $props();

  const appName = env.PUBLIC_APP_NAME || "Omicron";
</script>

<aside class="flex flex-col gap-6 text-sm">
  {#if !user}
    <div class="rounded-card border border-border bg-background-alt p-4 shadow-card">
      <h2 class="text-foreground text-base font-semibold">Welcome to {appName}</h2>
      <p class="text-muted-foreground mt-1 leading-relaxed">
        Read and write stories across the fediverse. Follow anyone on any ActivityPub
        server.
      </p>
      <div class="mt-4 flex flex-col gap-2">
        <Button href="/register" variant="solid">Get started</Button>
        <Button href="/login" variant="outline">Sign in</Button>
      </div>
    </div>
  {/if}

  <div>
    <h2 class="text-foreground text-base font-semibold">Discover</h2>
    <p class="text-muted-foreground mt-1 leading-relaxed">
      A place to read, write, and connect — powered by ActivityPub. No lock-in, fully
      self-hostable.
    </p>
  </div>

  <Separator.Root class="bg-border h-px w-full" />

  <a
    href="https://activitypub.rocks"
    target="_blank"
    rel="noopener noreferrer"
    class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
  >
    <Icon name="globe" size={16} /> Learn about the fediverse
  </a>

  <p class="text-muted-foreground text-xs">
    © {new Date().getFullYear()} {appName} · Federated blogging
  </p>
</aside>
