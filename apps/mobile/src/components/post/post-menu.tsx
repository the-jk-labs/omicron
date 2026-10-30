import type { Post } from "@omicron/contract";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { Share } from "react-native";
import { useApi, useInstance } from "@/components/instance-provider";
import { IconButton } from "@/components/ui/button";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { useViewer } from "@/lib/auth/session";
import { confirm, confirmDialog } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { postPath } from "@/lib/links";
import { goBack } from "@/lib/navigation";
import { updatePostEverywhere } from "@/lib/query/cache";
import { createStore, useStore } from "@/lib/store";

async function run(action: () => Promise<unknown>, done: string) {
  try {
    await action();
    toast(done);
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

// One sheet for the whole app, as with Save to list: a sheet per feed card would mount hundreds of them.
// `inReader`: the post is the open page, so removing it leaves the page.
const target = createStore<{ post: Post; inReader: boolean } | null>(null);

/** The ⋮ button on a card or the reader. */
export function PostMenuButton({ post, inReader = false, size }: { post: Post; inReader?: boolean; size?: number }) {
  return (
    <IconButton
      icon="ellipsis-vertical"
      label="Post options"
      size={size}
      iconClassName={inReader ? undefined : "text-muted-foreground"}
      onPress={() => target.set({ post, inReader })}
    />
  );
}

/** The post menu, with the same actions and permissions as the web's. Mounted once, beside the app's stack. */
export function PostMenuHost() {
  const current = useStore(target);
  const sheet = useSheet();
  useEffect(() => {
    if (current) sheet.ref.current?.present();
  }, [current, sheet.ref]);
  return current ? <PostMenu post={current.post} inReader={current.inReader} sheet={sheet} /> : null;
}

function PostMenu({ post, inReader, sheet }: { post: Post; inReader: boolean; sheet: ReturnType<typeof useSheet> }) {
  const api = useApi();
  const { origin } = useInstance();
  const { user } = useViewer();
  const queryClient = useQueryClient();
  const leave = () => {
    if (inReader) goBack();
  };

  const isAuthor = user?.id === post.author.id;
  const isModerator = Boolean(user?.isAdmin || user?.isModerator);
  const refreshPosts = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });

  return (
    <>
      <MenuSheet
        sheetRef={sheet.ref}
        onDismiss={() => target.set(null)}
        items={[
          {
            label: "Share",
            icon: "share-2",
            afterClose: true,
            onPress: () =>
              void Share.share({ message: `${origin}${postPath(post)}`, url: `${origin}${postPath(post)}` }),
          },
          {
            label: "Edit",
            icon: "pencil",
            hidden: !isAuthor,
            onPress: () => router.push({ pathname: "/compose", params: { id: post.id } }),
          },
          {
            label: "Move to drafts",
            icon: "file-text",
            hidden: !isAuthor || post.remote,
            onPress: async () => {
              if (
                !(await confirm({
                  title: "Move to drafts?",
                  description: "Readers will no longer see this post.",
                  confirmText: "Move to drafts",
                }))
              )
                return;
              await run(() => api.updatePost(post.id, { status: "draft", publishAt: null }), "Moved to drafts");
              await refreshPosts();
              leave();
            },
          },
          {
            label: "Report",
            icon: "flag",
            hidden: isAuthor || !user,
            onPress: async () => {
              if (
                await confirm({
                  title: "Report this post?",
                  description: "The instance's moderators will review it.",
                  confirmText: "Report",
                })
              )
                await run(() => api.report("post", post.id), "Thanks, the moderators will take a look.");
            },
          },
          {
            label: post.aiAssisted ? "Remove AI-assisted label" : "Mark as AI-assisted",
            icon: "sparkles",
            hidden: !isModerator,
            onPress: () =>
              void run(async () => {
                const { aiAssisted } = post.aiAssisted
                  ? await api.adminRemovePostAiAssisted(post.id)
                  : await api.adminMarkPostAiAssisted(post.id);
                updatePostEverywhere(queryClient, post.id, (p) => ({ ...p, aiAssisted }));
              }, "Label updated"),
          },
          {
            label: "Delete",
            icon: "trash-2",
            destructive: true,
            hidden: !isAuthor && !isModerator,
            onPress: async () => {
              const { confirmed, notify } = await confirmDialog({
                title: "Delete this post?",
                description: "This can't be undone.",
                confirmText: "Delete",
                destructive: true,
                notify: isAuthor ? undefined : "Notify the author",
              });
              if (!confirmed) return;
              await run(
                () => (isAuthor ? api.deletePost(post.id) : api.adminRemovePost(post.id, notify)),
                "Post deleted",
              );
              await refreshPosts();
              leave();
            },
          },
        ]}
      />
    </>
  );
}
