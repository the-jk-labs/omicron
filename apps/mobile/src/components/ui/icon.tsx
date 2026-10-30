import { Lucide } from "@react-native-vector-icons/lucide/static";
import type { ComponentProps } from "react";
import { withUniwind } from "uniwind";

export type IconName = ComponentProps<typeof Lucide>["name"];

const StyledLucide = withUniwind(Lucide);

export type IconProps = { name: IconName; size?: number; className?: string };

/** A Lucide icon (same set as the web). Colour it with a text class, e.g. `text-muted-foreground`. */
export function Icon({ name, size = 20, className = "text-foreground" }: IconProps) {
  return <StyledLucide name={name} size={size} className={className} />;
}
