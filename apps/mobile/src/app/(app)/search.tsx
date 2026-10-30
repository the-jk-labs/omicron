import type { RelationActor, TagWithCount } from "@omicron/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/components/instance-provider";
import { Screen } from "@/components/layout/screen";
import { PostCard } from "@/components/post/post-card";
import { RandomPostButton } from "@/components/post/random-post";
import { ActorRow } from "@/components/profile/actor-row";
import { FollowButton } from "@/components/profile/follow-button";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useDebounced } from "@/hooks/use-debounced";
import { tagPath } from "@/lib/links";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";
import { rankSearchSections } from "@/lib/search-rank";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2 pt-5">
      <Text size="sm" weight="semibold" tone="muted" className="px-4 uppercase">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Before a query: the web's Discover rail (trending, who to follow, topics). */
function Discover() {
  const api = useApi();
  const trending = useQuery({ queryKey: queryKeys.trending, queryFn: async () => (await api.trendingPosts()).items });
  const people = useQuery({
    queryKey: queryKeys.suggestedUsers,
    queryFn: async () => (await api.suggestedUsers()).items,
  });
  const tags = useQuery({ queryKey: queryKeys.trendingTags, queryFn: async () => (await api.trendingTags()).tags });

  return (
    <View>
      {(tags.data?.length ?? 0) > 0 && (
        <Section title="Topics">
          <View className="flex-row flex-wrap gap-2 px-4">
            {tags.data?.slice(0, 12).map((tag) => (
              <Link key={tag.slug} href={tagPath(tag.slug)} asChild>
                <PressableScale className="rounded-full bg-muted px-3 py-1.5">
                  <Text size="sm" weight="medium" tone="alt">
                    #{tag.name}
                  </Text>
                </PressableScale>
              </Link>
            ))}
          </View>
        </Section>
      )}
      {(people.data?.length ?? 0) > 0 && (
        <Section title="Who to follow">
          {people.data?.slice(0, 5).map((actor) => (
            <ActorRow
              key={actor.id}
              actor={actor}
              subtitle={`${actor.followerCount} ${actor.followerCount === 1 ? "follower" : "followers"}`}
              action={<FollowButton username={actor.username} state="none" size="xs" />}
            />
          ))}
        </Section>
      )}
      {(trending.data?.length ?? 0) > 0 && (
        <Section title="Trending">
          {trending.data?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </Section>
      )}
    </View>
  );
}

function TagRow({ tag }: { tag: TagWithCount }) {
  return (
    <Link href={tagPath(tag.slug)} asChild>
      <PressableScale pressedScale={0.99} className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <View className="size-10 items-center justify-center rounded-full bg-muted">
          <Icon name="hash" size={18} />
        </View>
        <View className="flex-1">
          <Text weight="semibold">#{tag.name}</Text>
          <Text size="sm" tone="muted">
            {tag.postCount} {tag.postCount === 1 ? "story" : "stories"}
          </Text>
        </View>
      </PressableScale>
    </Link>
  );
}

const PEOPLE_PREVIEW = 3;

function PeopleSection({ people }: { people: RelationActor[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? people : people.slice(0, PEOPLE_PREVIEW);
  return (
    <Section title="People">
      {shown.map((actor) => (
        <ActorRow key={actor.id} actor={actor} />
      ))}
      {!expanded && people.length > PEOPLE_PREVIEW && (
        <PressableScale accessibilityRole="button" onPress={() => setExpanded(true)} className="px-4 py-2">
          <Text size="sm" weight="medium" tone="alt">
            Show all {people.length} people
          </Text>
        </PressableScale>
      )}
    </Section>
  );
}

/** Every kind of match on one page, the kind that best fits the query first. */
function Results({ q }: { q: string }) {
  const api = useApi();
  const results = useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api.search(q),
    meta: { persist: false },
  });
  if (results.isPending) return <LoadingState />;
  if (results.error) return <ErrorState error={results.error} onRetry={() => void results.refetch()} />;

  const sections = rankSearchSections(q, results.data);
  if (sections.length === 0)
    return (
      <EmptyState icon="search" title={`No results for “${q}”`} description="Try other words or a shorter search." />
    );
  return sections.map((section) => {
    if (section === "people") return <PeopleSection key="people" people={results.data.people} />;
    if (section === "tags")
      return (
        <Section key="tags" title="Tags">
          {results.data.tags.map((tag) => (
            <TagRow key={tag.slug} tag={tag} />
          ))}
        </Section>
      );
    return (
      <Section key="posts" title="Articles">
        {results.data.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </Section>
    );
  });
}

export default function Search() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());

  return (
    <Screen>
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton icon="arrow-left" label="Back" onPress={goBack} iconClassName="text-foreground" />
        <View className="flex-1 justify-center">
          <Input
            value={text}
            onChangeText={setText}
            placeholder="Search articles, people and tags"
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            className="h-10 pl-9"
          />
          <View className="absolute left-3" pointerEvents="none">
            <Icon name="search" size={16} className="text-muted-foreground" />
          </View>
        </View>
        <RandomPostButton />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {q.length === 0 ? <Discover /> : <Results q={q} />}
      </ScrollView>
    </Screen>
  );
}
