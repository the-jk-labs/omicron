import type { Post } from "@omicron/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useApi } from "@/components/instance-provider";
import { useViewer } from "@/lib/auth/session";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { restoreSnapshot, updatePostEverywhere, type CacheSnapshot } from "./cache";

type Toggle = { id: string; on: boolean };

/** Sends guests to sign in instead of firing a request that can only 401. */
export function useRequireSignIn() {
  const { signedIn } = useViewer();
  return (action: () => void) => {
    if (signedIn) action();
    else router.push("/sign-in");
  };
}

function useOptimisticPostToggle(
  apply: (post: Post, on: boolean) => Post,
  request: (toggle: Toggle) => Promise<Partial<Post>>,
) {
  const queryClient = useQueryClient();
  return useMutation<Partial<Post>, unknown, Toggle, CacheSnapshot>({
    mutationFn: request,
    onMutate: (toggle) => {
      void Haptics.selectionAsync();
      return updatePostEverywhere(queryClient, toggle.id, (post) => apply(post, toggle.on));
    },
    // The server's counts win over our guess (others may have reacted meanwhile).
    onSuccess: (state, toggle) => updatePostEverywhere(queryClient, toggle.id, (post) => ({ ...post, ...state })),
    onError: (error, _toggle, snapshot) => {
      if (snapshot) restoreSnapshot(queryClient, snapshot);
      toast(errorMessage(error), "error");
    },
  });
}

export function useToggleLike() {
  const api = useApi();
  return useOptimisticPostToggle(
    (post, on) => ({ ...post, liked: on, likeCount: Math.max(0, post.likeCount + (on ? 1 : -1)) }),
    ({ id, on }) => (on ? api.likePost(id) : api.unlikePost(id)),
  );
}

export function useToggleRecommend() {
  const api = useApi();
  return useOptimisticPostToggle(
    (post, on) => ({ ...post, recommended: on, recommendCount: Math.max(0, post.recommendCount + (on ? 1 : -1)) }),
    ({ id, on }) => (on ? api.recommendPost(id) : api.unrecommendPost(id)),
  );
}
