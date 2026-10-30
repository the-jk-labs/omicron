import { Stack } from "expo-router";
import { useStackOptions } from "@/components/layout/stack-options";

export default function AuthLayout() {
  // Sign in, register and reset replace each other inside one sheet, so they cross-fade.
  return <Stack screenOptions={{ ...useStackOptions(), animation: "fade", animationDuration: 180 }} />;
}
