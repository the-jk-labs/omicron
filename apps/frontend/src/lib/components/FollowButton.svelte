<script lang="ts">
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  let { username, following }: { username: string; following: boolean } = $props();
  let isFollowing = $state(following);
  let busy = $state(false);

  async function toggle() {
    busy = true;
    try {
      if (isFollowing) await endpoints().unfollow(username);
      else await endpoints().follow(username);
      isFollowing = !isFollowing;
    } finally {
      busy = false;
    }
  }
</script>

<Button onclick={toggle} disabled={busy} variant={isFollowing ? "outline" : "solid"}>
  <Icon name={isFollowing ? "unfollow" : "follow"} size={16} />
  {isFollowing ? "Following" : "Follow"}
</Button>
