import Svg, { Path } from "react-native-svg";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme-colors";
import { platformMeta } from "@/lib/profile-links";

/** A profile link's brand mark (Simple Icons, as on the web), or its Lucide fallback. */
export function LinkIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const color = useThemeColor("--color-foreground-alt");
  const meta = platformMeta(platform);
  if (meta.brand) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={meta.brand} fill={color} />
      </Svg>
    );
  }
  return <Icon name={meta.icon ?? "link"} size={size} className="text-foreground-alt" />;
}
