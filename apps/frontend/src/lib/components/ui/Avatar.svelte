<script lang="ts">
  import { Avatar } from "bits-ui";

  // Styled with the Bits UI docs' Avatar classes verbatim (bg-muted fallback with
  // initials). No avatar URLs exist yet, so the fallback is what normally renders.
  let {
    name,
    src = undefined,
    size = 40,
    class: className = "",
  }: { name: string; src?: string; size?: number; class?: string } = $props();

  const initials = $derived(
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?",
  );
</script>

<Avatar.Root
  delayMs={200}
  style={`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`}
  class={`data-[status=loaded]:border-foreground bg-muted text-muted-foreground rounded-full border font-medium uppercase data-[status=loading]:border-transparent ${className}`}
>
  <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-transparent">
    {#if src}
      <Avatar.Image {src} alt={name} class="aspect-square h-full w-full" />
    {/if}
    <Avatar.Fallback class="border-muted flex h-full w-full items-center justify-center rounded-full border">
      {initials}
    </Avatar.Fallback>
  </div>
</Avatar.Root>
