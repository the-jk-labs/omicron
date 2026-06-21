<script lang="ts">
  import { Separator } from "bits-ui";
  import Button from "$lib/components/ui/Button.svelte";
  import type { Post } from "$lib/types";

  let { post }: { post: Post } = $props();

  // Plain-text excerpt from the rendered HTML (no DOM needed — strip tags).
  const excerpt = $derived(
    post.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
  );
  const date = $derived(new Date(post.createdAt).toLocaleDateString());
</script>

<article class="border-b border-neutral-200 py-6">
  <div class="mb-2 flex items-center gap-2 text-sm text-neutral-500">
    <Button href={`/@${post.author.username}`} variant="ghost" class="!px-0 font-medium text-neutral-800">
      {post.author.displayName}
    </Button>
    <Separator.Root orientation="vertical" class="h-3 w-px bg-neutral-300" />
    <span>{date}</span>
    {#if post.remote}
      <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">federated</span>
    {/if}
  </div>
  <Button href={`/posts/${post.id}`} variant="ghost" class="!px-0 block w-full text-left">
    {#if post.title}
      <h2 class="text-xl font-bold text-neutral-900">{post.title}</h2>
    {/if}
    <p class="mt-1 text-neutral-600">{excerpt}{excerpt.length >= 200 ? "…" : ""}</p>
  </Button>
</article>
