<script lang="ts">
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { excerpt, formatDate, readTime } from "$lib/format";
  import type { Post } from "$lib/types";

  let { post }: { post: Post } = $props();

  const summary = $derived(excerpt(post.contentHtml));
  const minutes = $derived(readTime(post.contentHtml));
</script>

<article class="border-b border-neutral-200 py-7">
  <div class="mb-3 flex items-center gap-2 text-sm text-neutral-700">
    <Button href={`/@${post.author.username}`} variant="plain" class="flex items-center gap-2 hover:opacity-80">
      <Avatar name={post.author.displayName} size={24} />
      <span class="font-medium text-neutral-900">{post.author.displayName}</span>
    </Button>
  </div>

  <Button href={`/posts/${post.id}`} variant="plain" class="group block w-full text-left">
    {#if post.title}
      <h2 class="text-xl font-bold leading-snug text-neutral-900 group-hover:text-neutral-700 sm:text-2xl">
        {post.title}
      </h2>
    {/if}
    {#if summary}
      <p class="mt-1.5 line-clamp-3 text-neutral-600">{summary}</p>
    {/if}
  </Button>

  <div class="mt-4 flex items-center gap-3 text-xs text-neutral-500">
    <span>{formatDate(post.createdAt)}</span>
    <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
    {#if post.remote}
      <span class="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
        <Icon name="globe" size={12} /> Federated
      </span>
    {/if}
  </div>
</article>
