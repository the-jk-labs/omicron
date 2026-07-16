<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { FollowState } from "$lib/types";

  // For remote actors `username` is the full `user@host` handle and follows go
  // through the federated endpoints (signed Follow/Undo); local follows are
  // internal. The button looks and behaves the same either way.
  //
  // `followState` is the richer local model — none / requested (private account
  // awaiting approval) / following. When omitted (remote profiles) it derives
  // from the `following` boolean, so the button stays two-state there.
  let { username, following, followState, remote = false, size = "default" }: {
    username: string;
    following: boolean;
    followState?: FollowState;
    remote?: boolean;
    size?: "default" | "sm" | "xs";
  } = $props();

  let current = $state<FollowState>(
    untrack(() => followState ?? (following ? "following" : "none")),
  );
  let busy = $state(false);
  // Re-sync when the button is reused across a client-side navigation (e.g. from
  // one profile page to another); local toggles don't touch the props.
  $effect(() => {
    current = followState ?? (following ? "following" : "none");
  });

  async function toggle() {
    busy = true;
    try {
      if (current === "following" || current === "requested") {
        // Unfollow, or cancel a pending request — both drop the edge.
        await (remote ? endpoints().remoteUnfollow(username) : endpoints().unfollow(username));
        current = "none";
      } else if (remote) {
        await endpoints().remoteFollow(username);
        current = "following";
      } else {
        // Local follow: the server tells us whether it's an instant follow or a
        // request pending the private account's approval.
        const res = await endpoints().follow(username);
        current = res.state;
      }
    } finally {
      busy = false;
    }
  }

  const label = $derived(
    current === "following" ? "Following" : current === "requested" ? "Requested" : "Follow",
  );
  const icon = $derived(
    current === "following" ? "unfollow" : current === "requested" ? "clock" : "follow",
  );
</script>

<Button
  onclick={toggle}
  disabled={busy}
  {size}
  variant={current === "none" ? "solid" : "outline"}
>
  <Icon name={icon} size={size === "xs" ? 14 : 16} />
  {label}
</Button>
