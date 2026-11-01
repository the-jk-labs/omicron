<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Collapsible } from "bits-ui";
</script>

<Collapsible.Root class="mt-4 rounded-card border border-border bg-background-alt p-4">
  <Collapsible.Trigger
    class="inline-flex h-10 items-center gap-2 rounded-input px-3 text-sm font-medium text-foreground hover:bg-muted"
  >
    Accessible writing guide
  </Collapsible.Trigger>
  <Collapsible.Content class="mt-3 space-y-3 text-sm text-muted-foreground">
    <p>Review these items before publishing. Automated checks cannot decide whether your meaning is accessible.</p>
    <ul class="list-disc space-y-2 pl-5">
      <li>
        <strong class="text-foreground">Images:</strong> describe the information or function, not the filename. In
        Markdown use <code>![Description](image-url)</code>. Use an empty alternative only when the image adds no
        information. Explain complex graphs in nearby text as well.
      </li>
      <li>
        <strong class="text-foreground">Structure:</strong> use real headings, lists, and quotes rather than bold text or
        spacing to imitate them. After the page title, start sections at Heading 2. Check that the reading order still makes
        sense without the visual layout.
      </li>
      <li>
        <strong class="text-foreground">Tables:</strong> give data tables meaningful header cells and a caption where useful.
        Check which headers apply to each cell, especially after merging cells. Avoid tables used only for layout.
      </li>
      <li>
        <strong class="text-foreground">Links:</strong> explain the destination or action in the link text or its context.
        Replace ambiguous text such as “click here” when the surrounding text does not explain it.
      </li>
      <li>
        <strong class="text-foreground">Language:</strong> select the article language. Mark passages in other languages
        with Text language, or use <code>&lt;span lang="fr"&gt;…&lt;/span&gt;</code> in Markdown/HTML.
      </li>
      <li>
        <strong class="text-foreground">Meaning:</strong> do not rely only on colour, shape, position, or sound. Prefer real
        text to pictures of text. Give instructions that make sense when read aloud.
      </li>
      <li>
        <strong class="text-foreground">Motion:</strong> prefer still images. Avoid flashing content and animations that readers
        cannot pause. An image description does not replace a pause control. Use Image display in the navigation to hide images
        while reading or editing. It follows reduced-motion preferences by default and never changes the saved article.
      </li>
      <li>
        <strong class="text-foreground">Paste and drop:</strong> the article editor asks before simplifying unsupported HTML.
        Cancel to keep the article unchanged. Copied or dropped images can retain provided descriptions; file-only images
        still need review in Image settings. Insert one image at a time when descriptions cannot be matched reliably. Paste
        or use the image upload button as a keyboard alternative to dragging. Insert unmatched text separately.
      </li>
      <li>
        <strong class="text-foreground">Final review:</strong> use Preview where available, check links with the keyboard,
        and review the published result at increased text size. Fix any meaning lost when images or styling are unavailable.
      </li>
    </ul>
    <a
      href="https://www.w3.org/WAI/WCAG22/quickref/"
      target="_blank"
      rel="noopener noreferrer"
      class="font-medium text-foreground underline underline-offset-4"
      >Complete WCAG 2.2 reference (opens in a new tab)</a
    >
  </Collapsible.Content>
</Collapsible.Root>
