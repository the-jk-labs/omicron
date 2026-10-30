import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

// React Native can't synthesize weights, so each weight maps to its own font family.
const text = tv({
  base: "font-sans text-foreground",
  variants: {
    weight: {
      regular: "font-sans",
      medium: "font-sans-medium",
      semibold: "font-sans-semibold",
      bold: "font-sans-bold",
    },
    size: {
      xxs: "text-xxs",
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
    },
    tone: {
      default: "text-foreground",
      alt: "text-foreground-alt",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
      inverse: "text-background",
    },
  },
  defaultVariants: { weight: "regular", size: "base", tone: "default" },
});

export type TextProps = RNTextProps & VariantProps<typeof text>;

export function Text({ className, weight, size, tone, ...props }: TextProps) {
  return <RNText className={text({ weight, size, tone, className })} {...props} />;
}
