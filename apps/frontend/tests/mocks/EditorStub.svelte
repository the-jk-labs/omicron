<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Stands in for the Tiptap Editor: a textarea whose input reports `<p>text</p>` through onUpdate. -->
<script lang="ts">
  let { onUpdate, content }: { onUpdate: (html: string, json: unknown) => void; content?: unknown } = $props();
</script>

<textarea
  aria-label="Body"
  data-content={typeof content === "string" ? content : JSON.stringify(content ?? null)}
  oninput={(e) => {
    const text = e.currentTarget.value;
    onUpdate(text ? `<p>${text}</p>` : "<p></p>", { type: "doc", text });
  }}></textarea>
