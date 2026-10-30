import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { PostList } from "@/components/post/post-list";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useRequireSignIn } from "@/lib/query/engagement";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

export default function TagScreen() {
  const { tag: slug } = useLocalSearchParams<{ tag: string }>();
  const api = useApi();
  const queryClient = useQueryClient();
  const requireSignIn = useRequireSignIn();
  const detail = useQuery({ queryKey: queryKeys.tag(slug), queryFn: () => api.tag(slug) });
  const posts = usePagedQuery(queryKeys.tagPosts(slug), (cursor) => api.tagPosts(slug, cursor));
  const scrollY = useSharedValue(0);

  const follow = useMutation({
    mutationFn: (on: boolean) => (on ? api.followTag(slug) : api.unfollowTag(slug)),
    onMutate: (on) =>
      queryClient.setQueryData(
        queryKeys.tag(slug),
        (current: typeof detail.data) =>
          current && { ...current, isFollowing: on, followerCount: current.followerCount + (on ? 1 : -1) },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tag(slug) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followedTags });
    },
  });

  const info = detail.data;
  return (
    <Screen>
      <ScreenHeader title={info ? `#${info.tag.name}` : `#${slug}`} collapse={{ scrollY, after: 40 }} />
      <PostList
        query={posts}
        scrollY={scrollY}
        empty={{ title: "No posts with this tag yet" }}
        header={
          info ? (
            <View className="border-border gap-3 border-b px-4 py-5">
              <Text size="3xl" weight="bold">
                #{info.tag.name}
              </Text>
              <Text size="sm" tone="muted">
                {info.postCount} {info.postCount === 1 ? "story" : "stories"} · {info.followerCount}{" "}
                {info.followerCount === 1 ? "follower" : "followers"}
              </Text>
              <Button
                variant={info.isFollowing ? "outline" : "solid"}
                size="sm"
                className="self-start"
                icon={info.isFollowing ? "check" : "plus"}
                onPress={() => requireSignIn(() => follow.mutate(!info.isFollowing))}
              >
                {info.isFollowing ? "Following" : "Follow tag"}
              </Button>
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}
