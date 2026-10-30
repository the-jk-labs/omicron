import type { Comment, Page } from "@omicron/contract";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useApi } from "@/components/instance-provider";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { updatePostEverywhere } from "./cache";
import { queryKeys } from "./keys";

type Pages = InfiniteData<Page<Comment>, string | null>;

/** Maps one comment wherever it sits: top level or inside a thread's replies. */
export function mapComment(
  pages: Pages | undefined,
  id: string,
  update: (comment: Comment) => Comment,
): Pages | undefined {
  if (!pages) return pages;
  const visit = (comment: Comment): Comment => {
    if (comment.id === id) return update(comment);
    const replies = comment.replies.map(visit);
    return replies.some((reply, index) => reply !== comment.replies[index]) ? { ...comment, replies } : comment;
  };
  return { ...pages, pages: pages.pages.map((page) => ({ ...page, items: page.items.map(visit) })) };
}

const onError = (error: unknown) => toast(errorMessage(error), "error");

export function useCommentActions(postId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.comments(postId);
  const bumpCount = (delta: number) =>
    updatePostEverywhere(queryClient, postId, (post) => ({
      ...post,
      commentCount: Math.max(0, post.commentCount + delta),
    }));

  const create = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId: string | null }) =>
      api.createComment(postId, content, parentId),
    onSuccess: () => {
      bumpCount(1);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const edit = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.editComment(postId, id, content),
    onSuccess: ({ comment }) =>
      queryClient.setQueryData<Pages>(key, (pages) =>
        mapComment(pages, comment.id, (c) => ({ ...c, content: comment.content })),
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(postId, id),
    onSuccess: () => {
      bumpCount(-1);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  const like = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? api.likeComment(postId, id) : api.unlikeComment(postId, id),
    onMutate: ({ id, on }) =>
      queryClient.setQueryData<Pages>(key, (pages) =>
        mapComment(pages, id, (c) => ({ ...c, liked: on, likeCount: Math.max(0, c.likeCount + (on ? 1 : -1)) })),
      ),
    onSuccess: (state, { id }) =>
      queryClient.setQueryData<Pages>(key, (pages) => mapComment(pages, id, (c) => ({ ...c, ...state }))),
    onError: (error, { id, on }) => {
      queryClient.setQueryData<Pages>(key, (pages) =>
        mapComment(pages, id, (c) => ({ ...c, liked: !on, likeCount: Math.max(0, c.likeCount + (on ? -1 : 1)) })),
      );
      onError(error);
    },
  });

  return { create, edit, remove, like };
}
