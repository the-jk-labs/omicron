<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User | null } = $props();

  type Item = { label: string; href: string; icon: IconName };

  const items = $derived<Item[]>(
    user
      ? [
          { label: "Home", href: "/", icon: "home" },
          { label: "Write", href: "/compose", icon: "compose" },
          { label: "Profile", href: `/@${user.username}`, icon: "user" },
        ]
      : [{ label: "Home", href: "/", icon: "home" }],
  );

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path.startsWith(href);
  }
</script>

<nav class="flex flex-col gap-1">
  {#each items as item (item.href)}
    <Button.Root
      href={item.href}
      class={`inline-flex h-10 items-center gap-3 rounded-input px-3 text-sm font-medium active:scale-[0.98] ${
        active(item.href)
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon name={item.icon} size={20} /> {item.label}
    </Button.Root>
  {/each}
</nav>
