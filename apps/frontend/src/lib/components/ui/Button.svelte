<script lang="ts">
  import { Button, type ButtonRootProps } from "bits-ui";

  type Variant = "solid" | "outline" | "ghost" | "icon";

  let {
    children,
    variant = "ghost",
    class: className = "",
    ...rest
  }: ButtonRootProps & { variant?: Variant; class?: string } = $props();

  const base =
    "inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<Variant, string> = {
    solid: "bg-neutral-900 text-white px-4 py-2 hover:bg-neutral-700",
    outline: "border border-neutral-300 px-4 py-2 hover:bg-neutral-100",
    ghost: "px-3 py-1.5 text-neutral-700 hover:bg-neutral-100",
    icon: "h-9 w-9 justify-center rounded-full text-neutral-700 hover:bg-neutral-100",
  };
</script>

<Button.Root class={`${base} ${variants[variant]} ${className}`} {...rest}>
  {@render children?.()}
</Button.Root>
