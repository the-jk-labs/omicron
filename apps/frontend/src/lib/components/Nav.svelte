<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User | null } = $props();

  async function logout() {
    await endpoints().logout();
    await invalidateAll();
    goto("/");
  }
</script>

<header class="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
  <nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
    <Button href="/" variant="ghost" class="!px-0 text-lg font-semibold text-neutral-900">
      <Icon name="feather" />{env.PUBLIC_APP_NAME || "Omicron"}
    </Button>

    <div class="flex items-center gap-1">
      <Button href="/" variant="icon" aria-label="Home"><Icon name="home" /></Button>
      {#if user}
        <Button href="/compose" variant="ghost"><Icon name="compose" /> Write</Button>
        <Button href={`/@${user.username}`} variant="icon" aria-label="Profile"><Icon name="user" /></Button>
        <Button onclick={logout} variant="icon"><Icon name="logout" /></Button>
      {:else}
        <Button href="/login" variant="ghost"><Icon name="login" /> Sign in</Button>
        <Button href="/register" variant="solid">Get started</Button>
      {/if}
    </div>
  </nav>
</header>
