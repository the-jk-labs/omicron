import type { FollowState } from "@omicron/contract";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/dialogs/confirm";
import { useRequireSignIn } from "@/lib/query/engagement";
import { useRelation } from "@/lib/query/profile";

/** Follow / Following / Requested, for a local or remote account. Asks before unfollowing. */
export function FollowButton({
  username,
  state,
  size = "sm",
  shape,
}: {
  username: string;
  state: FollowState;
  size?: "default" | "sm" | "xs";
  shape?: "default" | "pill";
}) {
  const relation = useRelation(username);
  const requireSignIn = useRequireSignIn();

  const onPress = () =>
    requireSignIn(async () => {
      if (state !== "none") {
        const ok = await confirm({
          title: state === "requested" ? "Cancel follow request?" : `Unfollow @${username}?`,
          confirmText: state === "requested" ? "Cancel request" : "Unfollow",
          cancelText: "Keep",
        });
        if (!ok) return;
      }
      relation.mutate({ relation: "follow", on: state === "none" });
    });

  return (
    <Button
      size={size}
      shape={shape}
      variant={state === "none" ? "solid" : "outline"}
      icon={state === "following" ? "user-check" : state === "requested" ? "clock" : "user-plus"}
      onPress={onPress}
    >
      {state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow"}
    </Button>
  );
}
