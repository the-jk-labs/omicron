import type { Comment } from "@omicron/contract";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useApi } from "@/components/instance-provider";
import { UserAvatar } from "@/components/post/post-bits";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ListFooter } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { profilePath } from "@/lib/links";
import { useCommentActions } from "@/lib/query/comments";
import { useRequireSignIn } from "@/lib/query/engagement";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

const MAX_COMMENT_LEN = 2000;

type Draft = { mode: "reply"; target: Comment; thread: Comment } | { mode: "edit"; target: Comment } | null;

function Composer({
  postId,
  draft,
  text,
  setText,
  onDone,
}: {
  postId: string;
  draft: Draft;
  text: string;
  setText: (text: string) => void;
  onDone: () => void;
}) {
  const actions = useCommentActions(postId);
  const busy = actions.create.isPending || actions.edit.isPending;
  const failure = actions.create.error ?? actions.edit.error;

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    const options = { onSuccess: onDone };
    if (draft?.mode === "edit") actions.edit.mutate({ id: draft.target.id, content }, options);
    else actions.create.mutate({ content, parentId: draft?.mode === "reply" ? draft.thread.id : null }, options);
  };

  return (
    <View className="gap-2">
      {draft && (
        <View className="flex-row items-center justify-between">
          <Text size="xs" tone="muted">
            {draft.mode === "edit" ? "Editing your comment" : `Replying to ${draft.target.author.displayName}`}
          </Text>
          <PressableScale onPress={onDone}>
            <Text size="xs" weight="medium" className="underline">
              Cancel
            </Text>
          </PressableScale>
        </View>
      )}
      <Input
        value={text}
        onChangeText={setText}
        placeholder="What are your thoughts?"
        multiline
        maxLength={MAX_COMMENT_LEN}
        className="h-auto min-h-20 py-3"
        textAlignVertical="top"
      />
      <View className="flex-row items-center justify-between">
        <Text size="xs" tone={failure ? "destructive" : "muted"}>
          {failure ? errorMessage(failure) : `${text.length}/${MAX_COMMENT_LEN}`}
        </Text>
        <Button variant="solid" size="sm" loading={busy} disabled={!text.trim()} onPress={submit}>
          {draft?.mode === "edit" ? "Save" : "Comment"}
        </Button>
      </View>
    </View>
  );
}

/** A top-level comment and its replies, which stay folded until asked for. */
function Thread({
  thread,
  postId,
  expanded,
  onExpand,
  onReply,
  onEdit,
}: {
  thread: Comment;
  postId: string;
  expanded: boolean;
  onExpand: () => void;
  onReply: (target: Comment) => void;
  onEdit: (target: Comment) => void;
}) {
  const count = thread.replies.length;
  return (
    <View className="border-border gap-3 border-t pt-4">
      <CommentRow comment={thread} postId={postId} onReply={() => onReply(thread)} onEdit={() => onEdit(thread)} />
      {count > 0 && expanded && (
        <Animated.View entering={FadeIn.duration(160)} className="border-border ml-10 gap-3 border-l pl-3">
          {thread.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              postId={postId}
              onReply={() => onReply(reply)}
              onEdit={() => onEdit(reply)}
            />
          ))}
        </Animated.View>
      )}
      {count > 0 && !expanded && (
        <PressableScale className="ml-10" onPress={onExpand}>
          <Text size="sm" weight="medium" tone="alt">
            {count === 1 ? "View 1 reply" : `View ${count} replies`}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

/** Comments under a post: one level of replies, as on the web (a reply to a reply gets an @mention). */
export function Comments({ postId }: { postId: string }) {
  const api = useApi();
  const { user } = useViewer();
  const requireSignIn = useRequireSignIn();
  const query = usePagedQuery(queryKeys.comments(postId), (cursor) => api.comments(postId, cursor));
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expand = (id: string) => setExpanded((current) => new Set(current).add(id));

  const startReply = (target: Comment, thread: Comment) =>
    requireSignIn(() => {
      setDraft({ mode: "reply", target, thread });
      // Replies stay one level deep, so a reply to a reply names who it answers.
      setText(target.id === thread.id ? "" : `@${target.author.username} `);
      expand(thread.id);
    });
  const startEdit = (target: Comment) => {
    setDraft({ mode: "edit", target });
    setText(target.content);
  };

  return (
    <View className="gap-4">
      <Text size="lg" weight="bold">
        Comments
      </Text>

      {user ? (
        <Composer
          postId={postId}
          draft={draft}
          text={text}
          setText={setText}
          onDone={() => {
            setText("");
            setDraft(null);
          }}
        />
      ) : (
        <Link href="/sign-in" asChild>
          <Button variant="outline">Sign in to comment</Button>
        </Link>
      )}

      {query.isPending && (
        <View className="py-6">
          <Spinner />
        </View>
      )}
      {!query.isPending && query.items.length === 0 && (
        <Text size="sm" tone="muted">
          No comments yet.
        </Text>
      )}
      {query.items.map((thread) => (
        <Thread
          key={thread.id}
          thread={thread}
          postId={postId}
          expanded={expanded.has(thread.id)}
          onExpand={() => expand(thread.id)}
          onReply={(target) => startReply(target, thread)}
          onEdit={startEdit}
        />
      ))}

      {query.hasNextPage && (
        <Button variant="outline" size="sm" loading={query.isFetchingNextPage} onPress={query.loadMore}>
          Show more comments
        </Button>
      )}
      {query.isFetchNextPageError && <ListFooter loading={false} error={query.error} onRetry={query.loadMore} />}
    </View>
  );
}

function CommentRow({
  comment,
  postId,
  onReply,
  onEdit,
}: {
  comment: Comment;
  postId: string;
  onReply: () => void;
  onEdit: () => void;
}) {
  const { user } = useViewer();
  const requireSignIn = useRequireSignIn();
  const { like, remove } = useCommentActions(postId);
  const menu = useSheet();
  const isAuthor = user?.id === comment.author.id;
  const canDelete = isAuthor || Boolean(user?.isAdmin || user?.isModerator);

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Link href={profilePath(comment.author.username)} asChild>
          <PressableScale accessibilityRole="link" className="shrink flex-row items-center gap-2">
            <UserAvatar name={comment.author.displayName} url={comment.author.avatarUrl} size={28} />
            <Text size="sm" weight="semibold" numberOfLines={1} className="shrink">
              {comment.author.displayName}
            </Text>
          </PressableScale>
        </Link>
        <Text size="xs" tone="muted">
          · {timeAgo(comment.createdAt)}
        </Text>
        {(isAuthor || canDelete) && (
          <PressableScale
            accessibilityLabel="Comment options"
            hitSlop={10}
            className="ml-auto p-1"
            onPress={menu.present}
          >
            <Icon name="ellipsis" size={16} className="text-muted-foreground" />
          </PressableScale>
        )}
      </View>
      <Text selectable className="leading-6">
        {comment.content}
      </Text>
      <View className="flex-row items-center gap-4">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={comment.liked ? "Unlike comment" : "Like comment"}
          hitSlop={8}
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
        <PressableScale accessibilityRole="button" hitSlop={8} onPress={onReply}>
          <Text size="xs" weight="medium" tone="muted">
            Reply
          </Text>
        </PressableScale>
      </View>
      <MenuSheet
        sheetRef={menu.ref}
        items={[
          { label: "Edit", icon: "pencil", hidden: !isAuthor, onPress: onEdit },
          {
            label: "Delete",
            icon: "trash-2",
            destructive: true,
            hidden: !canDelete,
            onPress: async () => {
              if (await confirm({ title: "Delete this comment?", confirmText: "Delete", destructive: true }))
                remove.mutate(comment.id);
            },
          },
        ]}
      />
    </View>
  );
}
