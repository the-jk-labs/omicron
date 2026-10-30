import { ActivityIndicator } from "react-native";

export function Spinner({ size = "small", inverse = false }: { size?: "small" | "large"; inverse?: boolean }) {
  return <ActivityIndicator size={size} colorClassName={inverse ? "accent-background" : "accent-muted-foreground"} />;
}
