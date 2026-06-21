<script lang="ts">
  import { Separator } from "bits-ui";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate, readTime } from "$lib/format";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = $derived(data.post);
  const minutes = $derived(readTime(post.contentHtml));
</script>

<svelte:head><title>{post.title ?? "Post"} · Omicron</title></svelte:head>

<article>
  {#if post.title}
    <h1 class="mb-6 text-4xl font-bold leading-tight tracking-tight text-neutral-900">{post.title}</h1>
  {/if}

  <div class="flex items-center gap-3 pb-8">
    <Avatar name={post.author.displayName} size={44} />
    <div class="text-sm">
      <Button href={`/@${post.author.username}`} variant="plain" class="font-medium text-neutral-900 hover:underline">
        {post.author.displayName}
      </Button>
      <div class="flex items-center gap-2 text-neutral-500">
        <span>{formatDate(post.createdAt)}</span>
        <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
        <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
        {#if post.remote}
          <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
          <span class="flex items-center gap-1"><Icon name="globe" size={13} /> Federated</span>
        {/if}
      </div>
    </div>
  </div>

  <Separator.Root class="bg-border mb-8 shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full" />

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron">
    {@html post.contentHtml}
  </div>
</article>
