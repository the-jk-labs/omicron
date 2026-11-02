<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A comment's plain text with each @mention linked to its profile. -->
<script lang="ts">
  import { splitMentions } from "#lib/mentions.js";

  let { content }: { content: string } = $props();
</script>

<!-- Segments touch with no whitespace between them: pre-wrap would show it. -->
<p class="mt-1 text-sm wrap-break-word whitespace-pre-wrap text-foreground-alt">
  {#each splitMentions(content) as segment (segment.start)}{#if segment.mention}<a
        href={`/@${segment.mention}`}
        class="font-medium text-foreground hover:underline">{segment.text}</a
      >{:else}{segment.text}{/if}{/each}
</p>
