import type { FollowState, Profile, RemoteProfile } from "@omicron/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/components/instance-provider";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { isRemoteUsername } from "@/lib/links";
import { queryKeys } from "./keys";

/** Local and remote profiles in one shape, so one screen renders either. */
export type ProfileData = {
  remote: boolean;
  user:
    | Profile["user"]
    | (RemoteProfile["user"] &
        Partial<Pick<Profile["user"], "links" | "customSectionHtml" | "isPrivate" | "publicEmail">>);
  counts: Profile["counts"];
  followState: FollowState;
  isMuted: boolean;
  isBlocked: boolean;
  locked: boolean;
};

export function toProfileData(profile: Profile | RemoteProfile): ProfileData {
  if ("followState" in profile) return { ...profile, remote: false };
  return {
    remote: true,
    user: profile.user,
    counts: profile.counts,
    followState: profile.isFollowing ? "following" : "none",
    isMuted: profile.isMuted,
    isBlocked: profile.isBlocked,
    locked: false,
  };
}

export function useProfile(username: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.profile(username),
    queryFn: async () =>
      toProfileData(isRemoteUsername(username) ? await api.remoteProfile(username) : await api.profile(username)),
  });
}

type Relation = "follow" | "mute" | "block";

/** Follow, mute and block for a local or remote account, updating the cached profile optimistically. */
export function useRelation(username: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.profile(username);
  const remote = isRemoteUsername(username);

  return useMutation({
    mutationFn: async ({ relation, on }: { relation: Relation; on: boolean }): Promise<FollowState | null> => {
      if (relation === "follow") {
        if (!on) {
          await (remote ? api.remoteUnfollow(username) : api.unfollow(username));
          return "none";
        }
        if (remote) {
          await api.remoteFollow(username);
          return "following";
        }
        // A private account turns a follow into a request awaiting approval.
        return (await api.follow(username)).state;
      }
      if (relation === "mute") {
        if (remote) await (on ? api.remoteMute(username) : api.remoteUnmute(username));
        else await (on ? api.mute(username) : api.unmute(username));
      } else if (remote) {
        await (on ? api.remoteBlock(username) : api.remoteUnblock(username));
      } else {
        await (on ? api.block(username) : api.unblock(username));
      }
      return null;
    },
    onMutate: ({ relation, on }) => {
      const previous = queryClient.getQueryData<ProfileData>(key);
      if (previous) {
        const patch: Partial<ProfileData> =
          relation === "follow"
            ? {
                followState: on ? (previous.user.isPrivate ? "requested" : "following") : "none",
                counts: {
                  ...previous.counts,
                  followers: previous.counts.followers + (on ? 1 : previous.followState === "following" ? -1 : 0),
                },
              }
            : relation === "mute"
              ? { isMuted: on }
              : { isBlocked: on, ...(on && { followState: "none" as const }) };
        queryClient.setQueryData<ProfileData>(key, { ...previous, ...patch });
      }
      return previous;
    },
    onSuccess: (state) => {
      if (state) queryClient.setQueryData<ProfileData>(key, (current) => current && { ...current, followState: state });
      // The For you feed depends on who is followed.
      void queryClient.invalidateQueries({ queryKey: ["feed", "for-you"] });
    },
    onError: (error, _vars, previous) => {
      if (previous) queryClient.setQueryData(key, previous);
      toast(errorMessage(error), "error");
    },
  });
}
