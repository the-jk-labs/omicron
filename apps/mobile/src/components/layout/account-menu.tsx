import { router } from "expo-router";
import { View } from "react-native";
import { UserAvatar } from "@/components/post/post-bits";
import { IconButton } from "@/components/ui/button";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useViewer } from "@/lib/auth/session";

/** Your own profile's ⋮ menu: the web's account dropdown, less what the tab bar and Settings already hold. */
export function AccountMenu() {
  const { user } = useViewer();
  const sheet = useSheet();
  if (!user) return null;

  return (
    <>
      <IconButton
        className="size-9 border border-input"
        size={16}
        iconClassName="text-foreground"
        icon="ellipsis-vertical"
        label="Account menu"
        onPress={sheet.present}
      />
      <MenuSheet
        sheetRef={sheet.ref}
        header={
          <View className="flex-row items-center gap-3 px-5 pb-4">
            <UserAvatar name={user.displayName} url={user.avatarUrl} size={44} />
            <View className="flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {user.displayName}
              </Text>
              <Text size="sm" tone="muted" numberOfLines={1}>
                @{user.username}
              </Text>
            </View>
          </View>
        }
        items={[
          {
            label: "Your posts",
            detail: "Drafts, scheduled and published",
            icon: "file-stack",
            opens: true,
            onPress: () => router.push("/posts/manage"),
          },
          {
            label: "Follow requests",
            detail: "People asking to follow you",
            icon: "user-plus",
            opens: true,
            hidden: !user.isPrivate,
            onPress: () => router.push("/follow-requests"),
          },
          {
            label: user.isAdmin ? "Admin" : "Moderation",
            detail: "Reports, users and the instance",
            icon: "gavel",
            opens: true,
            hidden: !user.isAdmin && !user.isModerator,
            onPress: () => router.push("/admin"),
          },
          {
            label: "Settings",
            detail: "Profile, account, privacy and preferences",
            icon: "settings",
            opens: true,
            onPress: () => router.push("/settings"),
          },
        ]}
      />
    </>
  );
}
