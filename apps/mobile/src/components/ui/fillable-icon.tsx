import Svg, { Path } from "react-native-svg";
import { useThemeColor } from "@/hooks/use-theme-colors";
import { FILLABLE, type Fillable } from "@/lib/fillable-icons";

export function FillableIcon({
  name,
  size,
  color,
  filled,
}: {
  name: Fillable;
  size: number;
  color: string;
  filled: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={FILLABLE[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}

/** The like heart: filled and in the like colour once liked, a muted outline before. */
export function LikeHeart({ size, liked }: { size: number; liked: boolean }) {
  const color = useThemeColor(liked ? "--color-destructive" : "--color-muted-foreground");
  return <FillableIcon name="heart" size={size} color={color} filled={liked} />;
}
