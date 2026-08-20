<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Avatar } from "bits-ui";

  // Styled with the Bits UI docs' Avatar classes verbatim (bg-muted fallback with
  // initials). Falls back to initials when `src` is absent or the image fails to load.
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
</script>

<Avatar.Root
  delayMs={200}
  style={`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`}
  class={`shrink-0 rounded-full border bg-muted font-medium text-muted-foreground uppercase data-[status=loaded]:border-foreground data-[status=loading]:border-transparent ${className}`}
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
        class="aspect-square h-full w-full object-cover"
      />
    {/if}
    <Avatar.Fallback
      aria-hidden="true"
      class="flex h-full w-full items-center justify-center rounded-full border border-muted"
    >
      {initials}
    </Avatar.Fallback>
  </div>
</Avatar.Root>
