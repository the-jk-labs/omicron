<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import welcomeBanner from "$lib/assets/welcome-banner.png";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import UIButton from "$lib/components/ui/Button.svelte";
  import type { InstanceInfo, User } from "$lib/types";
  import { Button } from "bits-ui";

  let {
    user,
    appName = "Omicron",
    instance = null,
  }: { user: User | null; appName?: string; instance?: InstanceInfo | null } = $props();

  type Item = { label: string; href: string; icon: IconName };

  // Primary navigation sits at the top of the rail.
  const items = $derived<Item[]>(
    user
      ? [
          { label: "Home", href: "/", icon: "home" },
          { label: "Profile", href: `/@${user.username}`, icon: "user" },
          { label: "Lists", href: "/lists", icon: "library" },
          { label: "Write", href: "/compose", icon: "compose" },
          { label: "Drafts", href: "/drafts", icon: "draft" },
          { label: "Dashboard", href: "/dashboard", icon: "chart" },
        ]
      : [{ label: "Home", href: "/", icon: "home" }],
  );

  // Admin (moderators only) and Settings are pinned to the bottom of the rail,
  // away from the primary items.
  const footerItems = $derived<Item[]>(
    user
      ? [
          ...(user.isAdmin ? [{ label: "Admin", href: "/admin", icon: "gavel" } as Item] : []),
          { label: "Settings", href: "/settings", icon: "settings" },
        ]
      : [],
  );

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path.startsWith(href);
  }

  const itemClass = (href: string) =>
    `inline-flex h-10 items-center gap-3 rounded-input px-3 text-sm font-medium active:scale-[0.98] ${
      active(href) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
</script>

<nav class="flex min-h-[calc(100vh-8.5rem)] flex-col gap-1">
  {#each items as item (item.href)}
    <Button.Root href={item.href} class={itemClass(item.href)}>
      <Icon name={item.icon} size={20} />
      {item.label}
    </Button.Root>
  {/each}

  {#if footerItems.length}
    <div class="mt-auto flex flex-col gap-1">
      {#each footerItems as item (item.href)}
        <Button.Root href={item.href} class={itemClass(item.href)}>
          <Icon name={item.icon} size={20} />
          {item.label}
        </Button.Root>
      {/each}
    </div>
  {/if}

  {#if !user}
    <!-- Signed-out visitor: who runs this place and how to join it. Pinned to
         the bottom (mt-auto) and sticky with the rest of the rail, so it stays
         on screen rather than scrolling away with the hero. -->
    <div class="mt-auto flex flex-col overflow-hidden rounded-card border border-border bg-background-alt text-sm">
      <img src={welcomeBanner} alt="" class="aspect-video w-full object-cover" />

      <div class="flex flex-col gap-4 p-3.5">
        <div>
          <p class="font-semibold text-foreground">{instance?.domain || appName}</p>
          <p class="mt-1 text-muted-foreground">
            An independent, self-hosted {appName} instance — read, write, and follow writers here, or anywhere on the
            fediverse.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <UIButton href="/register" variant="solid" size="sm">Create account</UIButton>
          <UIButton href="/login" variant="outline" size="sm">Sign in</UIButton>
        </div>

        {#if instance?.federationEnabled}
          <p class="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <Icon name="globe" size={14} />
            Federates across the fediverse
          </p>
        {/if}
      </div>
    </div>
  {/if}
</nav>
