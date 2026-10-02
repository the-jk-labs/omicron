<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts" module>
  import AtSign from "@lucide/svelte/icons/at-sign";
  import Ban from "@lucide/svelte/icons/ban";
  import Bell from "@lucide/svelte/icons/bell";
  import Bold from "@lucide/svelte/icons/bold";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import BookmarkCheck from "@lucide/svelte/icons/bookmark-check";
  import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
  import Calendar from "@lucide/svelte/icons/calendar";
  import Camera from "@lucide/svelte/icons/camera";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Clock from "@lucide/svelte/icons/clock";
  import Code from "@lucide/svelte/icons/code";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Copy from "@lucide/svelte/icons/copy";
  import Eye from "@lucide/svelte/icons/eye";
  // Single source of truth for icons. Every icon in the app comes from here, so
  // the icon set can be swapped or upgraded in ONE place. Add new icons to this
  // registry as needed — nothing else imports `@lucide/svelte` directly.
  // One deep import per icon: the package barrel loads ~1,850 icons, which made
  // every test file (and the dev server) compile them all.
  import Feather from "@lucide/svelte/icons/feather";
  import FileStack from "@lucide/svelte/icons/file-stack";
  import FileText from "@lucide/svelte/icons/file-text";
  import Flag from "@lucide/svelte/icons/flag";
  import Gavel from "@lucide/svelte/icons/gavel";
  import Globe from "@lucide/svelte/icons/globe";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Hash from "@lucide/svelte/icons/hash";
  import Heading from "@lucide/svelte/icons/heading";
  import Heading1 from "@lucide/svelte/icons/heading-1";
  import Heading2 from "@lucide/svelte/icons/heading-2";
  import Heading3 from "@lucide/svelte/icons/heading-3";
  import Heading4 from "@lucide/svelte/icons/heading-4";
  import Heading5 from "@lucide/svelte/icons/heading-5";
  import Heading6 from "@lucide/svelte/icons/heading-6";
  import Heart from "@lucide/svelte/icons/heart";
  import Home from "@lucide/svelte/icons/home";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Inbox from "@lucide/svelte/icons/inbox";
  import Italic from "@lucide/svelte/icons/italic";
  import Languages from "@lucide/svelte/icons/languages";
  import Library from "@lucide/svelte/icons/library";
  import LinkIcon from "@lucide/svelte/icons/link";
  import List from "@lucide/svelte/icons/list";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Lock from "@lucide/svelte/icons/lock";
  import LogIn from "@lucide/svelte/icons/log-in";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Mail from "@lucide/svelte/icons/mail";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Minus from "@lucide/svelte/icons/minus";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Pilcrow from "@lucide/svelte/icons/pilcrow";
  import Plus from "@lucide/svelte/icons/plus";
  import Quote from "@lucide/svelte/icons/quote";
  import Repeat2 from "@lucide/svelte/icons/repeat-2";
  import Reply from "@lucide/svelte/icons/reply";
  import Rss from "@lucide/svelte/icons/rss";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Share from "@lucide/svelte/icons/share";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import ShieldOff from "@lucide/svelte/icons/shield-off";
  import Smile from "@lucide/svelte/icons/smile";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Strikethrough from "@lucide/svelte/icons/strikethrough";
  import Sun from "@lucide/svelte/icons/sun";
  import Table from "@lucide/svelte/icons/table";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import TrendingUp from "@lucide/svelte/icons/trending-up";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import UserIcon from "@lucide/svelte/icons/user";
  import UserMinus from "@lucide/svelte/icons/user-minus";
  import UserPlus from "@lucide/svelte/icons/user-plus";
  import Users from "@lucide/svelte/icons/users";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import X from "@lucide/svelte/icons/x";

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
    languages: Languages,
    clock: Clock,
    users: Users,
    bold: Bold,
    italic: Italic,
    strike: Strikethrough,
    code: Code,
    codeBlock: Code2,
    link: LinkIcon,
    rss: Rss,
    bell: Bell,
    hr: Minus,
    heading: Heading,
    h1: Heading1,
    h2: Heading2,
    h3: Heading3,
    h4: Heading4,
    h5: Heading5,
    h6: Heading6,
    paragraph: Pilcrow,
    list: List,
    orderedList: ListOrdered,
    quote: Quote,
    chevronDown: ChevronDown,
    posts: FileStack,
    chevronLeft: ChevronLeft,
    chevronRight: ChevronRight,
    sun: Sun,
    moon: Moon,
    monitor: Monitor,
    camera: Camera,
    edit: Pencil,
    close: X,
    heart: Heart,
    comment: MessageCircle,
    reply: Reply,
    trash: Trash2,
    share: Share,
    check: Check,
    image: ImageIcon,
    smile: Smile,
    draft: FileText,
    calendar: Calendar,
    copy: Copy,
    admin: ShieldCheck,
    at: AtSign,
    mail: Mail,
    grip: GripVertical,
    mute: VolumeX,
    block: Ban,
    tag: Hash,
    bookmark: Bookmark,
    bookmarkPlus: BookmarkPlus,
    bookmarkCheck: BookmarkCheck,
    library: Library,
    chart: ChartColumn,
    eye: Eye,
    trending: TrendingUp,
    lock: Lock,
    plus: Plus,
    minus: Minus,
    flag: Flag,
    shieldOff: ShieldOff,
    inbox: Inbox,
    gavel: Gavel,
    table: Table,
    alert: TriangleAlert,
    recommend: Repeat2,
  } as const;

  export type IconName = keyof typeof icons;
</script>

<script lang="ts">
  let { name, size = 20, class: className = "" }: { name: IconName; size?: number; class?: string } = $props();

  const Cmp = $derived(icons[name]);
</script>

<Cmp {size} class={className} />
