<script lang="ts">
  import { onMount } from "svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { DropdownMenu } from "bits-ui";
  import { endpoints } from "$lib/api";
  import { theme } from "$lib/theme.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import logo from "$lib/assets/omicron.svg";
  import type { User } from "$lib/types";

  let { user }: { user: User | null } = $props();

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

<header class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
  <nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
    <Button href="/" variant="plain" class="flex items-center gap-2 text-foreground hover:opacity-80">
      <img src={logo} alt="" class="h-7 w-auto" />
      <span class="text-xl font-bold tracking-tight">{env.PUBLIC_APP_NAME || "Omicron"}</span>
    </Button>

    <div class="flex items-center gap-1.5">
      <Button
        onclick={() => theme.toggle()}
        variant="icon"
        class="!border-0 !shadow-none"
        aria-label="Toggle dark mode"
        title="Toggle theme"
      >
        <Icon name={ready && theme.current === "dark" ? "sun" : "moon"} size={18} />
      </Button>

      {#if user}
        <Button href="/compose" variant="ghost" class="text-muted-foreground">
          <Icon name="compose" size={18} /> <span class="hidden sm:inline">Write</span>
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="border-input text-foreground shadow-btn hover:bg-muted ml-1 inline-flex select-none items-center justify-center rounded-full border active:scale-[0.98]"
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
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              <DropdownMenu.Item onSelect={logout} class={itemClass}>
                <Icon name="logout" size={18} /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      {:else}
        <Button href="/login" variant="ghost" class="text-muted-foreground">Sign in</Button>
        <Button href="/register" variant="solid">Get started</Button>
      {/if}
    </div>
  </nav>
</header>
