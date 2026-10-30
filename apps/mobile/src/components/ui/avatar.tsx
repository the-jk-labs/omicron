import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { cn } from "tailwind-variants";
import { withUniwind } from "uniwind";
import { Text } from "./text";

const StyledImage = withUniwind(Image);

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Android pads text for ascenders and accents by default, which sits initials below the circle's centre.
function initialsStyle(size: number) {
  const fontSize = Math.round(size * 0.36);
  return { fontSize, lineHeight: fontSize, includeFontPadding: false, textAlignVertical: "center" } as const;
}

/** `bare` drops the outline and its inner gap, for a photo that is the whole control (the tab bar). */
export type AvatarProps = { name: string; src?: string; size?: number; className?: string; bare?: boolean };

/** Round avatar with an initials fallback, styled like the web's bits-ui Avatar. Decorative: name it nearby. */
export function Avatar({ name, src, size = 40, className, bare = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("shrink-0 rounded-full bg-muted", !bare && "border border-foreground", className)}
      style={{ width: size, height: size }}
    >
      <View
        className={cn(
          "flex-1 items-center justify-center overflow-hidden rounded-full",
          !bare && "border-2 border-transparent",
        )}
      >
        {showImage ? (
          <StyledImage
            source={src}
            className="size-full rounded-full"
            contentFit="cover"
            transition={120}
            recyclingKey={src}
            onError={() => setFailed(true)}
          />
        ) : (
          <Text weight="medium" tone="muted" style={initialsStyle(size)}>
            {initialsOf(name)}
          </Text>
        )}
      </View>
    </View>
  );
}
