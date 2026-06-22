<script lang="ts" module>
  // Single source of truth for icons. Every icon in the app comes from here, so
  // the icon set can be swapped or upgraded in ONE place. Add new icons to this
  // registry as needed — nothing else imports `@lucide/svelte` directly.
  import {
    Feather,
    Home,
    LogIn,
    LogOut,
    PenLine,
    User as UserIcon,
    UserPlus,
    UserMinus,
    LoaderCircle,
    Search,
    Settings,
    MoreHorizontal,
    BookOpen,
    Sparkles,
    Globe,
    Clock,
    Users,
    Bold,
    Italic,
    Heading1,
    Heading2,
    List,
    Quote,
    ChevronDown,
    Sun,
    Moon,
    Camera,
    Pencil,
    X,
    Heart,
    MessageCircle,
    Reply,
  } from "@lucide/svelte";

  export const icons = {
    feather: Feather,
    home: Home,
    login: LogIn,
    logout: LogOut,
    compose: PenLine,
    user: UserIcon,
    follow: UserPlus,
    unfollow: UserMinus,
    spinner: LoaderCircle,
    search: Search,
    settings: Settings,
    more: MoreHorizontal,
    read: BookOpen,
    sparkles: Sparkles,
    globe: Globe,
    clock: Clock,
    users: Users,
    bold: Bold,
    italic: Italic,
    h1: Heading1,
    h2: Heading2,
    list: List,
    quote: Quote,
    chevronDown: ChevronDown,
    sun: Sun,
    moon: Moon,
    camera: Camera,
    edit: Pencil,
    close: X,
    heart: Heart,
    comment: MessageCircle,
    reply: Reply,
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
