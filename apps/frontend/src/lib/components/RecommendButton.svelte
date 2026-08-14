<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { untrack } from "svelte";

  // Recommend ("repost") toggle — federates as an ActivityPub
  // Announce/Undo(Announce) to the signed-in user's remote followers. Mirrors
  // the post page's Like button (same Button component, same optimistic-update-
  // then-revert-on-failure shape). Props are re-seeded via `$effect` (not read
  // once) because both call sites — PostCard in a list and the post detail
  // page — can have this component's instance reused across a client-side
  // navigation to a different post.
  let {
    postId,
    recommended: recommendedProp,
    recommendCount: recommendCountProp,
    size = "default",
  }: {
    postId: string;
    recommended: boolean;
    recommendCount: number;
    size?: "default" | "sm" | "xs";
  } = $props();

  const iconSize = $derived({ default: 18, sm: 16, xs: 14 }[size]);

  let recommended = $state(untrack(() => recommendedProp));
  let count = $state(untrack(() => recommendCountProp));
  let busy = $state(false);

  $effect(() => {
    recommended = recommendedProp;
    count = recommendCountProp;
  });

  async function toggle() {
    if (!page.data.user) {
      goto("/login");
      return;
    }
    if (busy) return;
    busy = true;
    const was = recommended;
    // Optimistic update.
    recommended = !was;
    count += recommended ? 1 : -1;
    try {
      const res = was ? await endpoints().unrecommendPost(postId) : await endpoints().recommendPost(postId);
      recommended = res.recommended;
      count = res.recommendCount;
    } catch {
      recommended = was;
      count += was ? 1 : -1;
    } finally {
      busy = false;
    }
  }
</script>

<Button
  onclick={toggle}
  disabled={busy}
  variant="ghost"
  {size}
  class={recommended ? "text-foreground" : "text-muted-foreground"}
  aria-pressed={recommended}
  aria-label={recommended ? "Remove recommendation" : "Recommend"}
  title={recommended ? "Remove recommendation" : "Recommend"}
>
  <Icon name="recommend" size={iconSize} />
  <span class="tabular-nums">{count}</span>
</Button>
