<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Bottom tab bar shown only on small screens (below `lg`), where the left
  SideNav rail is hidden. Mirrors the rail's destinations so navigation is
  always reachable on phones. Signed-in only — guests navigate via the top bar.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User } = $props();

  type Item = { label: string; href: string; icon: IconName };

  const items = $derived<Item[]>([
    { label: "Home", href: "/", icon: "home" },
    { label: "Lists", href: "/lists", icon: "library" },
    { label: "Write", href: "/compose", icon: "compose" },
    { label: "Drafts", href: "/drafts", icon: "draft" },
    { label: "Stats", href: "/dashboard", icon: "chart" },
    { label: "Profile", href: `/@${user.username}`, icon: "user" },
    { label: "Settings", href: "/settings", icon: "settings" },
  ]);

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path.startsWith(href);
  }
</script>

<nav
  class="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
  aria-label="Primary"
>
  {#each items as item (item.href)}
    <Button.Root
      href={item.href}
      aria-current={active(item.href) ? "page" : undefined}
      class={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium active:scale-[0.97] ${
        active(item.href) ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <Icon name={item.icon} size={22} />
      {item.label}
    </Button.Root>
  {/each}
</nav>
