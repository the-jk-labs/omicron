import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import type { Comment, Post } from "@omicron/contract";
import { Link, router } from "expo-router";
import { createContext, memo, use, useRef, useState, type ComponentRef } from "react";
import { Keyboard, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useApi } from "@/components/instance-provider";
import { UserAvatar } from "@/components/post/post-bits";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, ListFooter, LoadingState, OfflineState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { commentsPath, profilePath } from "@/lib/links";
import { replyPrefix, splitMentions, stillAddressed } from "@/lib/mentions";
import { useIsOffline } from "@/lib/network/use-device-network";
import { useCommentActions } from "@/lib/query/comments";
import { useRequireSignIn } from "@/lib/query/engagement";
import { queryKeys } from "@/lib/query/keys";
import { emptyPhase } from "@/lib/query/list-state";
import { usePagedQuery } from "@/lib/query/paged";
import { CommentComposer } from "./comment-composer";

/** Comment text with each @mention linked to its profile. */
export function CommentText({ content, numberOfLines }: { content: string; numberOfLines?: number }) {
  return (
    <Text selectable={!numberOfLines} numberOfLines={numberOfLines} className="leading-6">
      {splitMentions(content).map((segment) =>
        segment.mention ? (
          <Text
            key={segment.start}
            weight="semibold"
            accessibilityRole="link"
            onPress={() => router.push(profilePath(segment.mention!))}
          >
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
}

type Draft = { mode: "reply"; target: Comment } | { mode: "edit"; target: Comment } | null;

type ThreadHandlers = {
  postId: string;
  expanded: ReadonlySet<string>;
  expand: (threadId: string) => void;
  reply: (target: Comment, thread: Comment) => void;
  openMenu: (comment: Comment) => void;
};

const ThreadContext = createContext<ThreadHandlers | null>(null);

const CommentRow = memo(function CommentRow({ comment, thread }: { comment: Comment; thread: Comment }) {
  const handlers = use(ThreadContext)!;
  const { user } = useViewer();
  const requireSignIn = useRequireSignIn();
  const { like } = useCommentActions(handlers.postId);
  const canManage = user?.id === comment.author.id || Boolean(user?.isAdmin || user?.isModerator);
  const isReply = comment.id !== thread.id;

  return (
    <View className="flex-row gap-3">
      <Link href={profilePath(comment.author.username)} asChild>
        <PressableScale accessibilityRole="link" accessibilityLabel={comment.author.displayName}>
          <UserAvatar name={comment.author.displayName} url={comment.author.avatarUrl} size={isReply ? 28 : 34} />
        </PressableScale>
      </Link>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Text size="sm" weight="semibold" numberOfLines={1} className="shrink">
            {comment.author.displayName}
          </Text>
          <Text size="xs" tone="muted">
            {timeAgo(comment.createdAt)}
          </Text>
          {canManage && (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Comment options"
              hitSlop={12}
              className="ml-auto p-0.5"
              onPress={() => handlers.openMenu(comment)}
            >
              <Icon name="ellipsis" size={16} className="text-muted-foreground" />
            </PressableScale>
          )}
        </View>
        <CommentText content={comment.content} />
        <View className="flex-row items-center gap-5 pt-0.5">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={comment.liked ? "Unlike comment" : "Like comment"}
            hitSlop={10}
            className="flex-row items-center gap-1"
            onPress={() => requireSignIn(() => like.mutate({ id: comment.id, on: !comment.liked }))}
          >
            <Icon name="heart" size={15} className={comment.liked ? "text-destructive" : "text-muted-foreground"} />
            {comment.likeCount > 0 && (
              <Text size="xs" tone="muted">
                {comment.likeCount}
              </Text>
            )}
          </PressableScale>
          <PressableScale accessibilityRole="button" hitSlop={10} onPress={() => handlers.reply(comment, thread)}>
            <Text size="xs" weight="semibold" tone="muted">
              Reply
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
});

/** A top-level comment and its replies, which stay folded until asked for. */
const ThreadItem = memo(function ThreadItem({ thread }: { thread: Comment }) {
  const handlers = use(ThreadContext)!;
  const count = thread.replies.length;
  const expanded = handlers.expanded.has(thread.id);
  return (
    <View className="gap-3 px-4 py-3">
      <CommentRow comment={thread} thread={thread} />
      {count > 0 && expanded && (
        <Animated.View entering={FadeIn.duration(160)} className="ml-11 gap-3">
          {thread.replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} thread={thread} />
          ))}
        </Animated.View>
      )}
      {count > 0 && !expanded && (
        <PressableScale
          accessibilityRole="button"
          className="ml-11 flex-row items-center gap-2"
          onPress={() => handlers.expand(thread.id)}
        >
          <View className="h-px w-6 bg-border" />
          <Text size="xs" weight="semibold" tone="muted">
            {count === 1 ? "View 1 reply" : `View ${count} replies`}
          </Text>
        </PressableScale>
      )}
    </View>
  );
});

const renderThread = ({ item }: { item: Comment }) => <ThreadItem thread={item} />;
const keyOf = (comment: Comment) => comment.id;

/** Everyone who has spoken in the loaded threads: the first people to suggest for an @mention. */
function participantsOf(threads: readonly Comment[], viewerId: string | undefined) {
  const people = new Map<string, Comment["author"]>();
  for (const thread of threads)
    for (const comment of [thread, ...thread.replies])
      if (comment.author.id !== viewerId) people.set(comment.author.id, comment.author);
  return [...people.values()];
}

/** The whole comments screen below its header: threads, and the composer pinned above the keyboard. */
export function CommentsView({ postId, autoFocus }: { postId: string; autoFocus?: boolean }) {
  const api = useApi();
  const { user } = useViewer();
  const requireSignIn = useRequireSignIn();
  const offline = useIsOffline();
  const query = usePagedQuery(queryKeys.comments(postId), (cursor) => api.comments(postId, cursor));
  const actions = useCommentActions(postId);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [menuTarget, setMenuTarget] = useState<Comment | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const listRef = useRef<LegendListRef>(null);
  const menu = useSheet();

  const expand = (id: string) => setExpanded((current) => new Set(current).add(id));
  const reset = () => {
    setText("");
    setDraft(null);
  };

  const changeText = (next: string) => {
    setText(next);
    // Deleting the @name at the start turns a reply back into a new comment.
    if (draft?.mode === "reply" && !stillAddressed(next, draft.target.author.username)) setDraft(null);
  };

  const handlers: ThreadHandlers = {
    postId,
    expanded,
    expand,
    reply: (target, thread) =>
      requireSignIn(() => {
        setDraft({ mode: "reply", target });
        setText(replyPrefix(target.author.username));
        expand(thread.id);
        inputRef.current?.focus();
      }),
    openMenu: (comment) => {
      setMenuTarget(comment);
      menu.present();
    },
  };

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    if (draft?.mode === "edit") {
      actions.edit.mutate({ id: draft.target.id, content }, { onSuccess: reset });
      return;
    }
    const parentId = draft?.mode === "reply" ? draft.target.id : null;
    actions.create.mutate(
      { content, parentId },
      {
        onSuccess: () => {
          reset();
          Keyboard.dismiss();
          if (!parentId) void listRef.current?.scrollToOffset({ offset: 0, animated: true });
        },
      },
    );
  };

  const failure = actions.create.error ?? actions.edit.error;
  const isAuthor = menuTarget !== null && user?.id === menuTarget.author.id;

  const empty = () => {
    switch (emptyPhase(query, offline)) {
      case "offline":
        return <OfflineState />;
      case "loading":
        return <LoadingState />;
      case "error":
        return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
      default:
        return <EmptyState icon="message-circle" title="No comments yet" description="Start the conversation." />;
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
      <ThreadContext value={handlers}>
        <LegendList
          ref={listRef}
          data={query.items}
          renderItem={renderThread}
          keyExtractor={keyOf}
          extraData={handlers}
          estimatedItemSize={120}
          recycleItems
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={query.loadMore}
          refreshControl={<PullToRefresh onRefresh={query.refetch} />}
          ListEmptyComponent={empty()}
          ListFooterComponent={
            query.items.length > 0 ? (
              <ListFooter
                loading={query.isFetchingNextPage}
                error={query.isFetchNextPageError ? query.error : undefined}
                onRetry={query.loadMore}
              />
            ) : null
          }
        />
      </ThreadContext>

      <CommentComposer
        inputRef={inputRef}
        value={text}
        onChangeText={changeText}
        onSubmit={submit}
        busy={actions.create.isPending || actions.edit.isPending}
        error={failure ? errorMessage(failure) : null}
        editing={draft?.mode === "edit"}
        onCancelEdit={reset}
        participants={participantsOf(query.items, user?.id)}
        autoFocus={autoFocus}
      />

      <MenuSheet
        sheetRef={menu.ref}
        items={[
          {
            label: "Edit",
            icon: "pencil",
            hidden: !isAuthor,
            // The keyboard waits for the sheet to go, or the two fight over the screen.
            afterClose: true,
            onPress: () => {
              if (!menuTarget) return;
              setDraft({ mode: "edit", target: menuTarget });
              setText(menuTarget.content);
              inputRef.current?.focus();
            },
          },
          {
            label: "Delete",
            icon: "trash-2",
            destructive: true,
            onPress: async () => {
              if (!menuTarget) return;
              if (await confirm({ title: "Delete this comment?", confirmText: "Delete", destructive: true }))
                actions.remove.mutate(menuTarget.id);
            },
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

/** The end of an article: the first few comments and a way into the rest, as under an Instagram post. */
export function CommentsPreview({ post }: { post: Pick<Post, "id" | "commentCount"> }) {
  const api = useApi();
  const { user } = useViewer();
  const query = usePagedQuery(queryKeys.comments(post.id), (cursor) => api.comments(post.id, cursor));
  const shown = query.items.slice(0, 2);
  const open = (focus: boolean) => router.push(commentsPath(post.id, focus));

  return (
    <View className="gap-4">
      <Text size="lg" weight="bold">
        Comments{post.commentCount > 0 ? ` (${post.commentCount})` : ""}
      </Text>

      {query.isPending && (
        <View className="gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
        </View>
      )}
      {shown.map((comment) => (
        <PressableScale
          key={comment.id}
          accessibilityRole="button"
          className="flex-row gap-3"
          onPress={() => open(false)}
        >
          <UserAvatar name={comment.author.displayName} url={comment.author.avatarUrl} size={28} />
          <View className="flex-1 gap-0.5">
            <Text size="sm" weight="semibold" numberOfLines={1}>
              {comment.author.displayName}
            </Text>
            <CommentText content={comment.content} numberOfLines={3} />
          </View>
        </PressableScale>
      ))}
      {post.commentCount > shown.length && (
        <PressableScale accessibilityRole="button" onPress={() => open(false)}>
          <Text size="sm" weight="medium" tone="muted">
            View all {post.commentCount} comments
          </Text>
        </PressableScale>
      )}

      {user ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Add a comment"
          className="flex-row items-center gap-3"
          onPress={() => open(true)}
        >
          <UserAvatar name={user.displayName} url={user.avatarUrl} size={32} />
          <View className="h-10 flex-1 justify-center rounded-card border border-border-input px-4">
            <Text size="sm" tone="muted">
              Add a comment…
            </Text>
          </View>
        </PressableScale>
      ) : (
        <Button variant="outline" onPress={() => router.push("/sign-in")}>
          Sign in to comment
        </Button>
      )}
    </View>
  );
}
