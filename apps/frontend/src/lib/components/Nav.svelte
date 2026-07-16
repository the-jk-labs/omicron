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
  import type { Notification, User } from "$lib/types";
  import { notifications } from "$lib/notifications.svelte";
  import {
    notificationAction,
    notificationHref,
    notificationIcon,
  } from "$lib/components/notifications";
  import { timeAgo } from "$lib/format";

  // `minimal` strips the nav down to logo + theme toggle for standalone pages
  // (auth screens), which carry their own focused layout. `appName` comes from
  // the instance settings, falling back to the build-time env then the default.
  let { user, minimal = false, appName = env.PUBLIC_APP_NAME || "Omicron" }: {
    user: User | null;
    minimal?: boolean;
    appName?: string;
  } = $props();

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

  // Notification bell state. The unread badge is driven by the polling store
  // (started/stopped with the signed-in user below); the list is fetched fresh
  // each time the dropdown opens, then marked read so the badge clears.
  let notifItems = $state<Notification[]>([]);
  let notifLoading = $state(false);

  async function loadNotifications() {
    notifLoading = true;
    try {
      const page = await endpoints().notifications();
      notifItems = page.items;
      if (notifications.count > 0) await endpoints().markAllNotificationsRead();
      notifications.clear();
    } catch {
      // Leave any previously loaded items; the bell stays usable.
    } finally {
      notifLoading = false;
    }
  }

  // Poll for unread notifications only while signed in.
  $effect(() => {
    if (user) notifications.start();
    else notifications.stop();
  });
</script>

<header class="sticky top-0 z-20 bg-background/80 backdrop-blur">
  <nav class="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
    <Button href="/" variant="plain" class="flex items-center gap-2 text-foreground hover:opacity-80">
      <img src={logo} alt="" width="28" height="28" class="h-7 w-auto" />
      <span class="text-xl font-bold tracking-tight">{appName}</span>
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
        <DropdownMenu.Root onOpenChange={(open) => open && loadNotifications()}>
          <DropdownMenu.Trigger
            class="text-muted-foreground hover:bg-muted relative inline-flex h-9 w-9 select-none items-center justify-center rounded-full active:scale-[0.98] focus-visible:outline-none"
            aria-label="Notifications"
          >
            <Icon name="bell" size={18} />
            {#if notifications.count > 0}
              <span
                class="bg-destructive text-background absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
              >
                {notifications.count > 99 ? "99+" : notifications.count}
              </span>
            {/if}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={8}
              align="end"
              class="border-muted bg-background shadow-popover z-30 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border p-1 focus-visible:outline-none"
            >
              <p class="text-foreground px-3 py-2 text-sm font-semibold">Notifications</p>
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              {#if notifLoading && notifItems.length === 0}
                <p class="text-muted-foreground px-3 py-6 text-center text-sm">Loading…</p>
              {:else if notifItems.length === 0}
                <p class="text-muted-foreground px-3 py-6 text-center text-sm">
                  No notifications yet.
                </p>
              {:else}
                <div class="max-h-[60vh] overflow-y-auto">
                  {#each notifItems as n (n.id)}
                    {@const href = notificationHref(n)}
                    <DropdownMenu.Item
                      onSelect={() => href && goto(href)}
                      class="rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex w-full cursor-pointer select-none items-start gap-3 px-3 py-2.5 focus-visible:outline-none {n.read
                        ? ''
                        : 'bg-muted/40'}"
                    >
                      <div class="relative shrink-0">
                        <Avatar
                          name={n.actor?.displayName ?? "?"}
                          src={n.actor?.avatarUrl ?? undefined}
                          size={36}
                        />
                        <span
                          class="bg-background text-muted-foreground absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full"
                        >
                          <Icon name={notificationIcon(n.type)} size={12} />
                        </span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-foreground text-sm leading-snug">
                          <span class="font-semibold">{n.actor?.displayName ?? "Someone"}</span>
                          {notificationAction(n.type)}
                        </p>
                        {#if n.postTitle}
                          <p class="text-muted-foreground truncate text-xs">{n.postTitle}</p>
                        {:else if n.commentSnippet}
                          <p class="text-muted-foreground truncate text-xs">{n.commentSnippet}</p>
                        {/if}
                        <p class="text-muted-foreground mt-0.5 text-xs">{timeAgo(n.createdAt)}</p>
                      </div>
                    </DropdownMenu.Item>
                  {/each}
                </div>
              {/if}
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              <DropdownMenu.Item
                onSelect={() => goto("/notifications")}
                class="rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex h-10 w-full cursor-pointer select-none items-center justify-center text-sm font-medium focus-visible:outline-none"
              >
                See all
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

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
              {#if user.isPrivate}
                <DropdownMenu.Item onSelect={() => goto("/follow-requests")} class={itemClass}>
                  <Icon name="lock" size={18} /> Follow requests
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Item onSelect={() => goto("/compose")} class={itemClass}>
                <Icon name="compose" size={18} /> Write a story
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => goto("/drafts")} class={itemClass}>
                <Icon name="draft" size={18} /> Drafts
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => goto("/lists")} class={itemClass}>
                <Icon name="library" size={18} /> Lists
              </DropdownMenu.Item>
              <DropdownMenu.Separator class="bg-muted -mx-1 my-1 h-px" />
              <DropdownMenu.Item onSelect={() => goto("/dashboard")} class={itemClass}>
                <Icon name="chart" size={18} /> Stats
              </DropdownMenu.Item>
              {#if user.isAdmin}
                <DropdownMenu.Item onSelect={() => goto("/admin")} class={itemClass}>
                  <Icon name="gavel" size={18} /> Admin
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Item onSelect={() => goto("/settings")} class={itemClass}>
                <Icon name="settings" size={18} /> Settings
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