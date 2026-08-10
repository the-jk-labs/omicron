<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Bottom tab bar shown only on small screens (below `lg`), where the left
  SideNav rail is hidden. Carries just the few most-switched destinations to
  stay uncrowded on phones; the rest (Drafts, Settings, …) live in the avatar
  menu in the top bar. Signed-in only — guests navigate via the top bar.

  Retracts on scroll-down and returns on scroll-up, so a long post gets the whole
  screen while the reader is moving through it.
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
    { label: "Stats", href: "/dashboard", icon: "chart" },
    { label: "Profile", href: `/@${user.username}`, icon: "user" },
  ]);

  function active(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path.startsWith(href);
  }

  // Firefox on Android retracts its browser toolbar on scroll-down but keeps the
  // *layout* viewport at its original, shorter height; only the *visual* viewport
  // grows into the strip the toolbar vacated. `bottom: 0` resolves against the
  // layout viewport, so the bar parks a toolbar-height above the real bottom edge
  // and article text shows through underneath it. Measuring the gap and pushing
  // the bar down by it re-pins it to what the reader actually sees.
  //
  // Gecko-gated, and it has to be. Blink re-pins fixed elements to the visual
  // viewport bottom itself, at composite time — so the same offset applied there
  // pushes the bar a toolbar-height *below* the screen and it slides out of view
  // on every scroll. Script cannot tell the two apart: `getBoundingClientRect()`
  // reports identical layout-viewport coordinates in both engines, because Blink's
  // correction never touches layout. Sniffing the engine is the only signal left.
  //
  // Clamped at zero on purpose: when the on-screen keyboard shrinks the visual
  // viewport this would otherwise lift the bar up over the keyboard, which is a
  // different behaviour change than the one being fixed here.
  let overhang = $state(0);

  $effect(() => {
    const vv = window.visualViewport;
    if (!vv || !navigator.userAgent.includes("Gecko/")) return;

    const measure = () => {
      const layoutHeight = document.documentElement.clientHeight;
      overhang = Math.max(0, vv.offsetTop + vv.height - layoutHeight);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  });

  // Retract on scroll-down, return on scroll-up. Driven by scroll direction
  // rather than by the browser's own toolbar, which no engine exposes and which
  // Blink and Gecko drive on different rules — reading it would make the bar
  // behave differently per browser, which is exactly what this replaces.
  let hiddenByScroll = $state(false);

  // Below this much travel a gesture is thumb-jitter, not a direction change;
  // reacting to it makes the bar flicker mid-scroll.
  const DIRECTION_THRESHOLD = 6;
  // Within this far from the top the bar always shows: at the head of a feed
  // there is nothing to read past, and hiding it there just costs a scroll-up.
  const ALWAYS_VISIBLE_ZONE = 80;

  $effect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      // Leave `lastY` alone below the threshold so slow travel still accumulates
      // into a direction change instead of being swallowed frame by frame.
      if (Math.abs(delta) < DIRECTION_THRESHOLD) return;
      hiddenByScroll = y > ALWAYS_VISIBLE_ZONE && delta > 0;
      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  // A retracted bar is off-screen but still in the tab order, so keyboard focus
  // can land on a tab nobody can see. Bring it back when that happens.
  function reveal() {
    hiddenByScroll = false;
  }
</script>

<nav
  class="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden"
  style={`transform: translateY(${overhang}px)${hiddenByScroll ? " translateY(100%)" : ""}`}
  onfocusin={reveal}
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
