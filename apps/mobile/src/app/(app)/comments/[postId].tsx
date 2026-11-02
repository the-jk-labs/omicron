import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { CommentsView } from "@/components/comments/comments";
import { Screen } from "@/components/layout/screen";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { goBack } from "@/lib/navigation";

/** A post's comments, laid over the reader with the composer pinned above the keyboard. */
export default function CommentsScreen() {
  const { postId, focus } = useLocalSearchParams<{ postId: string; focus?: string }>();
  return (
    <Screen>
      <View className="h-14 flex-row items-center border-b border-border px-2">
        <IconButton icon="x" label="Close" onPress={goBack} iconClassName="text-foreground" />
        <Text weight="semibold" size="lg" className="flex-1 text-center" accessibilityRole="header">
          Comments
        </Text>
        <View className="w-10" />
      </View>
      <CommentsView postId={postId} autoFocus={focus === "1"} />
    </Screen>
  );
}
