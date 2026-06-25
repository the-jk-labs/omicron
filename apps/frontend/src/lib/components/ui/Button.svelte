<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Button, type ButtonRootProps } from "bits-ui";

  // Every clickable element is bits-ui Button.Root, styled with the Bits UI docs'
  // own class strings: `solid` is the verbatim Button demo; `outline`/`icon`
  // reuse the docs DropdownMenu.Trigger style; `link` is the docs `.link` recipe.
  type Variant = "solid" | "destructive" | "outline" | "ghost" | "icon" | "link" | "plain";

  let {
    children,
    variant = "ghost",
    class: className = "",
    ...rest
  }: ButtonRootProps & { variant?: Variant; class?: string } = $props();

  const variants: Record<Variant, string> = {
    solid:
      "rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 inline-flex h-10 items-center justify-center gap-1.5 px-4 text-sm font-semibold active:scale-[0.98] active:transition-all",
    destructive:
      "rounded-input bg-destructive text-background shadow-mini hover:bg-destructive/90 inline-flex h-10 items-center justify-center gap-1.5 px-4 text-sm font-semibold active:scale-[0.98] active:transition-all",
    outline:
      "border-input text-foreground shadow-btn hover:bg-muted inline-flex h-10 select-none items-center justify-center gap-1.5 rounded-input border px-4 text-sm font-semibold active:scale-[0.98] active:transition-all",
    ghost:
      "text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-1.5 rounded-input px-3 text-sm font-medium active:scale-[0.98] active:transition-all",
    icon:
      "border-input text-foreground shadow-btn hover:bg-muted inline-flex h-10 w-10 select-none items-center justify-center rounded-full border text-sm font-medium active:scale-[0.98]",
    link:
      "hover:text-foreground/80 inline-flex items-center gap-1 font-medium underline underline-offset-4",
    plain: "",
  };
</script>

<Button.Root class={`${variants[variant]} ${className}`} {...rest}>
  {@render children?.()}
</Button.Root>