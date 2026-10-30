import { router, Tabs } from "expo-router";
import { TabBar, TabBarVisibilityProvider, type TabSpec } from "@/components/layout/tab-bar";
import { useViewer } from "@/lib/auth/session";

export default function TabsLayout() {
  const { user } = useViewer();

  // The web's MobileNav for members, with Stats where X keeps its own tools. Guests get Home, Search and Sign in.
  const tabs: TabSpec[] = user
    ? [
        { key: "index", label: "Home", icon: "house" },
        { key: "lists", label: "Lists", icon: "library" },
        { key: "write", label: "Write", icon: "pen-line", onPress: () => router.push("/compose") },
        { key: "stats", label: "Stats", icon: "chart-column" },
        {
          key: "profile",
          label: "Profile",
          icon: "user",
          avatar: { name: user.displayName, url: user.avatarUrl },
        },
      ]
    : [
        { key: "index", label: "Home", icon: "house" },
        { key: "search", label: "Search", icon: "search", onPress: () => router.push("/search") },
        { key: "sign-in", label: "Sign in", icon: "log-in", onPress: () => router.push("/sign-in") },
      ];

  return (
    <TabBarVisibilityProvider>
      <Tabs
        screenOptions={{ headerShown: false, animation: "fade", sceneStyle: { backgroundColor: "transparent" } }}
        tabBar={(props) => <TabBar {...props} tabs={tabs} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="lists" />
        <Tabs.Screen name="stats" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}
