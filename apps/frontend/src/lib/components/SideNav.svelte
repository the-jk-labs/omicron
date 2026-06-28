<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User | null } = $props();

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
        ]
      : [{ label: "Home", href: "/", icon: "home" }],
  );

  // Settings is pinned to the bottom of the rail, away from the primary items.
  const footerItems = $derived<Item[]>(
    user ? [{ label: "Settings", href: "/settings", icon: "settings" }] : [],
  );

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path.startsWith(href);
  }

  const itemClass = (href: string) =>
    `inline-flex h-10 items-center gap-3 rounded-input px-3 text-sm font-medium active:scale-[0.98] ${
      active(href)
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
</script>

<nav class="flex min-h-[calc(100vh-8.5rem)] flex-col gap-1">
  {#each items as item (item.href)}
    <Button.Root href={item.href} class={itemClass(item.href)}>
      <Icon name={item.icon} size={20} /> {item.label}
    </Button.Root>
  {/each}

  {#if footerItems.length}
    <div class="mt-auto flex flex-col gap-1">
      {#each footerItems as item (item.href)}
        <Button.Root href={item.href} class={itemClass(item.href)}>
          <Icon name={item.icon} size={20} /> {item.label}
        </Button.Root>
      {/each}
    </div>
  {/if}
</nav>