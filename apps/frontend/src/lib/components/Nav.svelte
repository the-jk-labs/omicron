<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { DropdownMenu } from "bits-ui";
  import { endpoints } from "$lib/api";
  import { theme } from "$lib/theme.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import logo from "$lib/assets/omicron.svg";
  import type { User } from "$lib/types";

  // `minimal` strips the nav down to logo + theme toggle for standalone pages
  // (auth screens), which carry their own focused layout.
  let { user, minimal = false }: { user: User | null; minimal?: boolean } = $props();

  // Render the resolved icon only after mount so SSR (always "light") and the
  // first client render match — avoids a hydration mismatch on the toggle.
  let ready = $state(false);
  onMount(() => (ready = true));

  async function logout() {
    await endpoints().logout();
    await invalidateAll();
    goto("/");
  }

  // Verbatim Bits UI docs DropdownMenu.Item class (v4 `data-highlighted:` /
  // `ring-0!` rewritten to the v3 `data-[highlighted]:` / `!ring-0` syntax).
  const itemClass =
    "rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex h-10 w-full cursor-pointer select-none items-center gap-2.5 py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-none";
</script>

<header class="sticky top-0 z-20 bg-background/80 backdrop-blur">
  <nav class="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
    <Button href="/" variant="plain" class="flex items-center gap-2 text-foreground hover:opacity-80">
      <img src={logo} alt="" width="28" height="28" class="h-7 w-auto" />
      <span class="text-xl font-bold tracking-tight">{env.PUBLIC_APP_NAME || "Omicron"}</span>
    </Button>

    {#if !minimal}
      <!-- Centered search pill (sm and up) -->
      <div class="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
        <SearchBar />
      </div>
    {/if}

    <div class="flex items-center gap-1.5">
      {#if !minimal}
        <!-- Icon-only search fallback (below sm) -->
        <Button href="/search" variant="icon" class="!border-0 !shadow-none sm:hidden" aria-label="Search">
          <Icon name="search" size={18} />
        </Button>
      {/if}

      <Button
        onclick={() => theme.toggle()}
        variant="icon"
        class="!border-0 !shadow-none"
        aria-label="Toggle dark mode"
        title="Toggle theme"
      >
        <Icon name={ready && theme.current === "dark" ? "sun" : "moon"} size={18} />
      </Button>

      {#if minimal}
        <!-- nothing else: auth pages own their own sign-in / register actions -->
      {:else if user}
        <Button href="/compose" variant="ghost" class="hidden text-muted-foreground sm:inline-flex" aria-label="Write">
          <Icon name="compose" size={18} /> <span class="hidden sm:inline">Write</span>
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex select-none items-center justify-center rounded-full active:scale-[0.98]"
            aria-label="Account menu"
          >
            <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size={34} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={8}
              align="end"
              class="border-muted bg-background shadow-popover z-30 w-[229px] rounded-xl border px-1 py-1.5 focus-visible:outline-none"
            >
              <div class="px-3 py-2">
                <p class="text-foreground truncate text-sm font-semibold">{user.displayName}</p>
                <p class="text-muted-foreground truncate text-xs">@{user.username}</p>
              </div>
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              <DropdownMenu.Item onSelect={() => goto(`/@${user.username}`)} class={itemClass}>
                <Icon name="user" size={18} /> Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => goto("/compose")} class={itemClass}>
                <Icon name="compose" size={18} /> Write a story
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => goto("/drafts")} class={itemClass}>
                <Icon name="draft" size={18} /> Drafts
              </DropdownMenu.Item>
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              <DropdownMenu.Item onSelect={logout} class={itemClass}>
                <Icon name="logout" size={18} /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      {:else}
        <Button href="/login" variant="ghost" class="hidden text-muted-foreground sm:inline-flex">Sign in</Button>
        <Button href="/register" variant="solid">Get started</Button>
      {/if}
    </div>
  </nav>
</header>