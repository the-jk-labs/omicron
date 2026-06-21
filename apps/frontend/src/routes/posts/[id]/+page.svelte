<script lang="ts">
  import { Separator } from "bits-ui";
  import Button from "$lib/components/ui/Button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = $derived(data.post);
  const date = $derived(new Date(post.createdAt).toLocaleDateString());
</script>

<svelte:head><title>{post.title ?? "Post"} · Omicron</title></svelte:head>

<article class="mx-auto max-w-2xl">
  {#if post.title}
    <h1 class="mb-3 text-4xl font-bold tracking-tight text-neutral-900">{post.title}</h1>
  {/if}
  <div class="mb-8 flex items-center gap-2 text-sm text-neutral-500">
    <Button href={`/@${post.author.username}`} variant="ghost" class="!px-0 font-medium text-neutral-800">
      {post.author.displayName}
    </Button>
    <Separator.Root orientation="vertical" class="h-3 w-px bg-neutral-300" />
    <span>{date}</span>
  </div>

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron">
    {@html post.contentHtml}
  </div>
</article>
