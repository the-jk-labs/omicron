import { View, type ViewProps } from "react-native";
import { cn } from "tailwind-variants";

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("rounded-card border border-border-card bg-background-alt p-4 shadow-card", className)}
      {...props}
    />
  );
}

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return <View className={cn(vertical ? "w-px self-stretch bg-border" : "h-hairline bg-border", className)} />;
}
