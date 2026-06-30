<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  // For remote actors `username` is the full `user@host` handle and follows go
  // through the federated endpoints (signed Follow/Undo); local follows are
  // internal. The button looks and behaves the same either way.
  let { username, following, remote = false, size = "default" }: {
    username: string;
    following: boolean;
    remote?: boolean;
    size?: "default" | "sm" | "xs";
  } = $props();
  let isFollowing = $state(following);
  let busy = $state(false);

  async function toggle() {
    busy = true;
    try {
      if (isFollowing) {
        await (remote ? endpoints().remoteUnfollow(username) : endpoints().unfollow(username));
      } else {
        await (remote ? endpoints().remoteFollow(username) : endpoints().follow(username));
      }
      isFollowing = !isFollowing;
    } finally {
      busy = false;
    }
  }
</script>

<Button onclick={toggle} disabled={busy} {size} variant={isFollowing ? "outline" : "solid"}>
  <Icon name={isFollowing ? "unfollow" : "follow"} size={size === "xs" ? 14 : 16} />
  {isFollowing ? "Following" : "Follow"}
</Button>