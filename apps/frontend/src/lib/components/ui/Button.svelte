<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Button, type ButtonRootProps } from "bits-ui";

  // Every clickable element is bits-ui Button.Root, styled with the Bits UI docs'
  // own class strings. `variant` controls the look (colour, border, weight);
  // `size` controls the geometry (height, padding, text) so callers never hand-
  // tune `h-9 px-4 …` strings — keeps every button on the same scale.
  type Variant = "solid" | "destructive" | "outline" | "ghost" | "icon" | "link" | "plain";
  type Size = "default" | "sm" | "xs";

  let {
    children,
    variant = "ghost",
    size = "default",
    class: className = "",
    ...rest
  }: ButtonRootProps & { variant?: Variant; size?: Size; class?: string } = $props();

  // Shared geometry for the text-button variants (everything except icon/link/plain,
  // which carry their own complete styling below).
  const base =
    "inline-flex items-center justify-center gap-1.5 active:scale-[0.98] active:transition-all";
  const sizes: Record<Size, string> = {
    default: "h-10 px-4 text-sm",
    sm: "h-9 px-3 text-sm",
    xs: "h-8 px-2 text-xs",
  };

  // Colour/border/weight only — geometry comes from `base` + `sizes`.
  const variants: Record<Variant, string> = {
    solid: "rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 font-semibold",
    destructive:
      "rounded-input bg-destructive text-background shadow-mini hover:bg-destructive/90 font-semibold",
    outline:
      "rounded-input border border-input text-foreground shadow-btn hover:bg-muted select-none font-semibold",
    ghost: "rounded-input text-foreground hover:bg-muted font-medium",
    icon: "border-input text-foreground shadow-btn hover:bg-muted inline-flex size-10 select-none items-center justify-center rounded-full border text-sm font-medium active:scale-[0.98]",
    link: "hover:text-foreground/80 inline-flex items-center gap-1 font-medium underline underline-offset-4",
    plain: "",
  };

  // icon/link/plain are self-contained; the rest compose base + size + variant.
  const classes = $derived(
    variant === "icon" || variant === "link" || variant === "plain"
      ? `${variants[variant]} ${className}`
      : `${base} ${sizes[size]} ${variants[variant]} ${className}`,
  );
</script>

<Button.Root class={classes} {...rest}>
  {@render children?.()}
</Button.Root>
