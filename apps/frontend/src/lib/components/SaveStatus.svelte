<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { SaveState } from "$lib/autosave.svelte";
  import Icon from "$lib/components/Icon.svelte";

  // The composer's autosave indicator: what the editor did with the author's
  // work and when. Its whole job is to make the missing "Save" click feel safe,
  // so it names a time rather than saying "Saved" forever — an author who
  // cannot tell whether that was two seconds or two hours ago saves by hand
  // anyway, and the feature has bought them nothing.

  let {
    status,
    savedAt,
    error = null,
  }: {
    status: SaveState;
    /** Epoch ms of the last successful save, or null if none yet. */
    savedAt: number | null;
    error?: string | null;
  } = $props();

  // The label ages on its own — nothing changes on the page between "just now"
  // and "3 minutes ago", so without a tick it would sit there lying.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  function ago(at: number, from: number): string {
    const s = Math.max(0, Math.round((from - at) / 1000));
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    // Past a day the clock time is the useful fact, not the count of hours.
    return new Date(at).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const label = $derived(
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Couldn't save"
        : savedAt !== null
          ? `Saved ${ago(savedAt, now)}`
          : "",
  );
</script>

{#if label}
  <p
    class="flex items-center gap-1.5 text-xs {status === 'error' ? 'text-destructive' : 'text-muted-foreground'}"
    title={status === "error" ? (error ?? undefined) : undefined}
    aria-live="polite"
  >
    {#if status === "saving"}
      <Icon name="spinner" size={13} class="animate-spin" />
    {:else if status === "error"}
      <Icon name="alert" size={13} />
    {:else}
      <Icon name="check" size={13} />
    {/if}
    {label}
  </p>
{/if}
