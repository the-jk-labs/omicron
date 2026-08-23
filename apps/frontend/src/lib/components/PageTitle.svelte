<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  The document title for one page, suffixed with this instance's name.

  Every page used to spell its own title with a literal "· Omicron", which is
  the project's name, not the operator's. A self-hosted instance is somebody's
  publication with its own identity — the setup wizard asks for it, the nav
  renders it — and it was correct everywhere except the browser tab, the
  bookmark, and the headline of every search result. Those are the places a
  reader actually reads a site's name from.

  Resolution order matches the nav's (`+layout.svelte`): the admin-configured
  instance name, then the build-time env, then the project name as a last
  resort. Read from `$page.data` rather than a prop so any page can drop this in
  without threading layout data down to it.

  Omit `text` on a page that is the site itself (the home feed) and the title is
  the instance name plus its tagline — `Omicron: fediverse üzərində müstəqil
  bloq platforması` — so the home tab, bookmark and search result carry the
  same promise a reader sees in the hero.
-->
<script lang="ts">
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import type { InstanceInfo } from "$lib/types";

  let { text }: { text?: string | null } = $props();

  const appName = $derived(
    ($page.data as { instance?: InstanceInfo | null }).instance?.name || env.PUBLIC_APP_NAME || "Omicron",
  );
  const homeTitle = $derived(`${appName}: fediverse üzərində müstəqil bloq platforması`);
</script>

<svelte:head>
  <title>{text ? `${text} · ${appName}` : homeTitle}</title>
</svelte:head>
