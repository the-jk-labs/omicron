<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";

  // Copies the feed's absolute URL instead of opening it. A feed reader asks the
  // reader to paste a URL into its "Add a feed" box, so the URL is the thing
  // they actually need; navigating there would just hand the browser an XML
  // document to download, which helps nobody.
  //
  // `path` is the feed's root-relative path; the origin comes from the current
  // request so a copied URL is absolute and works when pasted anywhere.
  let { path, label }: { path: string; label: string } = $props();

  const url = $derived(`${$page.url.origin}${path}`);
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard unavailable (insecure context); silently ignore, matching the
      // copy-fediverse-address button on the profile.
    }
  }
</script>

<Button
  variant="outline"
  size="sm"
  onclick={copy}
  aria-label={copied ? "RSS feed link copied" : label}
  title={copied ? "Copied" : label}
>
  <Icon name={copied ? "check" : "rss"} size={15} />
  {copied ? "Copied" : "RSS"}
</Button>
