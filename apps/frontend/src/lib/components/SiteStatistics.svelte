<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import { createUmamiTracker } from "#lib/umami.js";

  let { websiteId }: { websiteId: string | null } = $props();
  let tracker: ReturnType<typeof createUmamiTracker> | undefined;

  afterNavigate(({ from }) => {
    tracker ??= createUmamiTracker();
    const post = (page.data as { post?: { status?: string } }).post;
    const allowed = page.status === 200 && (!post?.status || post.status === "published");
    void tracker.track(websiteId, page.url, from?.url.href ?? document.referrer, allowed);
  });
  onDestroy(() => tracker?.destroy());
</script>
