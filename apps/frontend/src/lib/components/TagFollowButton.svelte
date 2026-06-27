<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  let { slug, following }: { slug: string; following: boolean } = $props();
  let isFollowing = $state(following);
  let busy = $state(false);

  async function toggle() {
    busy = true;
    try {
      if (isFollowing) await endpoints().unfollowTag(slug);
      else await endpoints().followTag(slug);
      isFollowing = !isFollowing;
    } finally {
      busy = false;
    }
  }
</script>

<Button onclick={toggle} disabled={busy} variant={isFollowing ? "outline" : "solid"}>
  <Icon name={isFollowing ? "check" : "tag"} size={16} />
  {isFollowing ? "Following" : "Follow"}
</Button>
