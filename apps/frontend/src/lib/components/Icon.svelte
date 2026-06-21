<script lang="ts" module>
  // Single source of truth for icons. Every icon in the app comes from here, so
  // the icon set can be swapped or upgraded in ONE place. Add new icons to this
  // registry as needed — nothing else imports `lucide-svelte` directly.
  import {
    Feather,
    Home,
    LogIn,
    LogOut,
    PenSquare,
    User as UserIcon,
    UserPlus,
    UserMinus,
    Loader,
  } from "@lucide/svelte";

  export const icons = {
    feather: Feather,
    home: Home,
    login: LogIn,
    logout: LogOut,
    compose: PenSquare,
    user: UserIcon,
    follow: UserPlus,
    unfollow: UserMinus,
    spinner: Loader,
  } as const;

  export type IconName = keyof typeof icons;
</script>

<script lang="ts">
  let {
    name,
    size = 20,
    class: className = "",
  }: { name: IconName; size?: number; class?: string } = $props();

  const Cmp = $derived(icons[name]);
</script>

<Cmp {size} class={className} />
