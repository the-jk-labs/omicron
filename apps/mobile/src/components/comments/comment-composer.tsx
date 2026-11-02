import type { RelationActor } from "@omicron/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ComponentRef, type RefObject } from "react";
import { TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { cn } from "tailwind-variants";
import { useApi } from "@/components/instance-provider";
import { BottomInset } from "@/components/layout/bottom-inset";
import { UserAvatar } from "@/components/post/post-bits";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useDebounced } from "@/hooks/use-debounced";
import { useViewer } from "@/lib/auth/session";
import { activeMention, insertMention, mergeSuggestions } from "@/lib/mentions";
import { queryKeys } from "@/lib/query/keys";

export const MAX_COMMENT_LEN = 2000;

type Person = Pick<RelationActor, "id" | "username" | "displayName" | "avatarUrl">;

/** People matching the `@handle` being typed: the thread's own participants first, then the instance's search. */
function useMentionSuggestions(query: string | null, participants: readonly Person[]) {
  const api = useApi();
  const settled = useDebounced(query, 200);
  const search = useQuery({
    queryKey: queryKeys.mentionSuggestions(settled ?? ""),
    queryFn: async () => (await api.search(settled ?? "", "people")).people,
    enabled: Boolean(settled),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  if (query === null) return [];
  return mergeSuggestions(query, participants, query ? (search.data ?? []) : [], 5);
}

function Suggestions({ people, onPick }: { people: Person[]; onPick: (person: Person) => void }) {
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} className="border-t border-border">
      {people.map((person) => (
        <PressableScale
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={`Mention ${person.displayName}`}
          className="flex-row items-center gap-3 px-4 py-2"
          onPress={() => onPick(person)}
        >
          <UserAvatar name={person.displayName} url={person.avatarUrl} size={32} />
          <View className="shrink">
            <Text size="sm" weight="semibold" numberOfLines={1}>
              {person.displayName}
            </Text>
            <Text size="xs" tone="muted" numberOfLines={1}>
              @{person.username}
            </Text>
          </View>
        </PressableScale>
      ))}
    </Animated.View>
  );
}

/**
 * The bar pinned above the keyboard, as in Instagram: one line that grows to a few as you write, then scrolls inside.
 * Typing `@` suggests people to mention.
 */
export function CommentComposer({
  inputRef,
  value,
  onChangeText,
  onSubmit,
  busy,
  error,
  editing,
  onCancelEdit,
  participants,
  autoFocus,
}: {
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  editing: boolean;
  onCancelEdit: () => void;
  participants: readonly Person[];
  autoFocus?: boolean;
}) {
  const { user } = useViewer();
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const active = focused ? activeMention(value, Math.min(caret, value.length)) : null;
  const people = useMentionSuggestions(active?.query ?? null, participants);
  const canSend = value.trim().length > 0 && !busy;

  if (!user) {
    return (
      <View className="border-t border-border bg-background">
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Text size="sm" tone="muted" className="flex-1">
            Sign in to join the conversation.
          </Text>
          <Button variant="solid" size="sm" onPress={() => router.push("/sign-in")}>
            Sign in
          </Button>
        </View>
        <BottomInset />
      </View>
    );
  }

  const pick = (person: Person) => {
    if (!active) return;
    const next = insertMention(value, active, person.username);
    onChangeText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => inputRef.current?.setSelection(next.caret, next.caret));
  };

  return (
    <View className="border-t border-border bg-background">
      {people.length > 0 && <Suggestions people={people} onPick={pick} />}
      {editing && (
        <View className="flex-row items-center justify-between px-4 pt-2">
          <Text size="xs" tone="muted">
            Editing your comment
          </Text>
          <PressableScale accessibilityRole="button" hitSlop={10} onPress={onCancelEdit}>
            <Text size="xs" weight="medium">
              Cancel
            </Text>
          </PressableScale>
        </View>
      )}
      {error && (
        <Text size="xs" tone="destructive" className="px-4 pt-2">
          {error}
        </Text>
      )}
      <View className="flex-row items-end gap-2.5 px-3 py-2">
        <View className="pb-1">
          <UserAvatar name={user.displayName} url={user.avatarUrl} size={32} />
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={(event) => setCaret(event.nativeEvent.selection.end)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          placeholder="Add a comment…"
          accessibilityLabel="Comment"
          multiline
          maxLength={MAX_COMMENT_LEN}
          textAlignVertical="top"
          placeholderTextColorClassName="accent-muted-foreground"
          selectionColorClassName="accent-foreground"
          cursorColorClassName="accent-foreground"
          // One line to start, up to five as it grows; past that the text scrolls inside the field.
          className="max-h-31 min-h-10 flex-1 rounded-card border border-border-input bg-background px-4 pt-2.5 pb-2.5 font-sans text-[15px] leading-5 text-foreground"
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={editing ? "Save comment" : "Post comment"}
          accessibilityState={{ disabled: !canSend, busy }}
          disabled={!canSend}
          pressedScale={0.92}
          onPress={onSubmit}
          className={cn(
            "size-10 items-center justify-center rounded-full bg-foreground",
            !canSend && !busy && "opacity-30",
          )}
        >
          {busy ? (
            <Spinner inverse />
          ) : (
            <Icon name={editing ? "check" : "arrow-up"} size={20} className="text-background" />
          )}
        </PressableScale>
      </View>
      <BottomInset />
    </View>
  );
}
