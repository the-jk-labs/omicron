<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Avatar } from "bits-ui";
  import { untrack } from "svelte";

  // Styled with the Bits UI docs' Avatar classes (bg-muted fallback with initials),
  // except the ring: the docs show it only once a photo loads, which made avatars
  // change as the page rendered, so here it is always on. The initials get a shade
  // of their own so the muted gap inside the ring shows around them as around a photo.
  // Falls back to initials when `src` is absent or the image fails to load.
  //
  // The avatar is decorative, and deliberately so: `name` feeds the initials and
  // nothing else. Every place this renders, the person is already named — as
  // adjacent text on a card, comment, or profile header, or by an `aria-label` on
  // the control wrapping it (the account menu, the change-photo button). Giving
  // the image `alt={name}` made a screen reader read that name twice, and the
  // initials made it three times when the image hadn't loaded: "Omicron Blog OB
  // Omicron Blog". So the picture and the initials are both hidden from assistive
  // tech; they are a second rendering of the neighbouring text, not new
  // information.
  //
  // The consequence for callers: an avatar can no longer be the only content of a
  // link or button. Put the name next to it inside the same control, or label the
  // control.
  let {
    name,
    src = undefined,
    size = 40,
    class: className = "",
  }: { name: string; src?: string; size?: number; class?: string } = $props();

  const initials = $derived(
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?",
  );

  // bits-ui starts every avatar "loading": the server-rendered <img> stays hidden
  // until a test load after hydration, so even a cached photo appeared late. With
  // a photo we start "loaded" so the browser paints it at once; a failing image
  // still falls back to the initials through its own error event.
  let status = $state<"loading" | "loaded" | "error">(untrack(() => (src ? "loaded" : "error")));
</script>

<Avatar.Root
  bind:loadingStatus={status}
  style={`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`}
  class={`shrink-0 rounded-full border border-foreground bg-muted font-medium text-muted-foreground uppercase ${className}`}
>
  <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-transparent">
    {#if src}
      <Avatar.Image
        {src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onerror={() => (status = "error")}
        class="aspect-square h-full w-full object-cover"
      />
    {/if}
    <Avatar.Fallback aria-hidden="true" class="flex h-full w-full items-center justify-center rounded-full bg-dark-10">
      {initials}
    </Avatar.Fallback>
  </div>
</Avatar.Root>
