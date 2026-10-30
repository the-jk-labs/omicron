import type { ReactNode } from "react";
import { cn } from "tailwind-variants";
import { tv, type VariantProps } from "tailwind-variants";
import { Icon, type IconName } from "./icon";
import { PressableScale, type PressableScaleProps } from "./pressable";
import { Spinner } from "./spinner";
import { Text } from "./text";

// Class strings mirror apps/frontend/src/lib/components/ui/Button.svelte.
const button = tv({
  slots: {
    root: "flex-row items-center justify-center gap-1.5",
    label: "font-sans-semibold",
    icon: "",
  },
  variants: {
    variant: {
      solid: { root: "bg-dark shadow-mini", label: "text-background", icon: "text-background" },
      destructive: {
        root: "bg-destructive shadow-mini",
        label: "text-background",
        icon: "text-background",
      },
      outline: {
        root: "border border-input bg-background shadow-btn",
        label: "text-foreground",
        icon: "text-foreground",
      },
      ghost: { root: "", label: "font-sans-medium text-foreground", icon: "text-foreground" },
      link: { root: "", label: "font-sans-medium text-foreground underline", icon: "text-foreground" },
    },
    size: {
      default: { root: "h-10 px-4", label: "text-sm" },
      sm: { root: "h-9 px-3", label: "text-sm" },
      xs: { root: "h-8 px-2", label: "text-xs" },
    },
    // Radius is its own variant: tailwind-merge can't tell `rounded-input` is a radius, so it can't be overridden.
    shape: { default: { root: "rounded-input" }, pill: { root: "rounded-full" } },
    disabled: { true: { root: "opacity-50" } },
    block: { true: { root: "self-stretch" } },
  },
  defaultVariants: { variant: "ghost", size: "default", shape: "default" },
});

export type ButtonProps = Omit<PressableScaleProps, "children"> &
  VariantProps<typeof button> & {
    children?: ReactNode;
    icon?: IconName;
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  shape,
  block,
  icon,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const slots = button({ variant, size, shape, block, disabled: isDisabled });
  const inverse = variant === "solid" || variant === "destructive";
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={slots.root({ className })}
      {...props}
    >
      {loading ? <Spinner inverse={inverse} /> : icon && <Icon name={icon} size={16} className={slots.icon()} />}
      {typeof children === "string" ? <Text className={slots.label()}>{children}</Text> : children}
    </PressableScale>
  );
}

export type IconButtonProps = Omit<PressableScaleProps, "children"> & {
  icon: IconName;
  /** Read by screen readers, since the button has no visible text. */
  label: string;
  size?: number;
  active?: boolean;
  iconClassName?: string;
};

/** Round, icon-only button. */
export function IconButton({
  icon,
  label,
  size = 20,
  active = false,
  iconClassName,
  className,
  ...props
}: IconButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      pressedScale={0.92}
      className={cn("size-10 items-center justify-center rounded-full", className)}
      {...props}
    >
      <Icon name={icon} size={size} className={iconClassName ?? (active ? "text-foreground" : "text-foreground-alt")} />
    </PressableScale>
  );
}
