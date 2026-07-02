<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { Report } from "$lib/types";

  let reports = $state<Report[]>([]);
  let openCount = $state(0);
  let loading = $state(true);
  let error = $state("");
  let filter = $state<"open" | "resolved">("open");
  let busyId = $state<string | null>(null);

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await endpoints().adminReports(filter);
      reports = res.reports;
      openCount = res.openCount;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load reports.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Re-run whenever the filter changes.
    filter;
    load();
  });

  function subjectHref(r: Report): string | null {
    if (r.subjectType === "post" && r.postAuthor && r.postId) {
      return `/@${r.postAuthor}/${r.postId}`;
    }
    if (r.subjectType === "user" && r.userUsername) return `/@${r.userUsername}`;
    return null;
  }

  function subjectLabel(r: Report): string {
    if (r.subjectType === "post") {
      return r.postId ? r.postTitle || "Untitled post" : "Post (removed)";
    }
    return r.userUsername ? `@${r.userUsername}` : "Account (removed)";
  }

  async function resolve(r: Report) {
    busyId = r.id;
    try {
      await endpoints().resolveReport(r.id);
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to resolve.";
    } finally {
      busyId = null;
    }
  }

  async function removePost(r: Report) {
    if (!r.postId) return;
    const ok = await confirm({
      title: "Remove post",
      description: "Permanently remove this post and resolve the report. This can't be undone.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    busyId = r.id;
    try {
      await endpoints().adminRemovePost(r.postId);
      await endpoints().resolveReport(r.id, "Post removed.");
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to remove post.";
    } finally {
      busyId = null;
    }
  }

  async function suspendAuthor(r: Report) {
    const id = r.subjectType === "user" ? r.userId : null;
    if (!id) return;
    const ok = await confirm({
      title: `Suspend @${r.userUsername}?`,
      description: "They will be signed out and unable to sign in until reinstated.",
      confirmText: "Suspend",
      destructive: true,
    });
    if (!ok) return;
    busyId = r.id;
    try {
      await endpoints().suspendUser(id, true);
      await endpoints().resolveReport(r.id, "Account suspended.");
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to suspend.";
    } finally {
      busyId = null;
    }
  }

  const triggerClass =
    "data-[state=active]:bg-background data-[state=active]:shadow-mini text-muted-foreground data-[state=active]:text-foreground inline-flex h-8 items-center gap-1.5 rounded-button px-3 text-sm font-medium";
</script>

<div class="flex flex-col gap-4">
  <Tabs.Root bind:value={filter}>
    <Tabs.List
      class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn"
    >
      <Tabs.Trigger value="open" class={triggerClass}>
        <Icon name="inbox" size={15} /> Open
        {#if openCount > 0}
          <span class="rounded-full bg-destructive px-1.5 text-xs font-semibold text-background">
            {openCount}
          </span>
        {/if}
      </Tabs.Trigger>
      <Tabs.Trigger value="resolved" class={triggerClass}>
        <Icon name="check" size={15} /> Resolved
      </Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
  {:else if reports.length === 0}
    <div class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
      <Icon name={filter === "open" ? "check" : "inbox"} size={28} />
      <p class="text-sm">{filter === "open" ? "No open reports. All clear." : "No resolved reports yet."}</p>
    </div>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each reports as r (r.id)}
        <li class="rounded-card border border-border bg-background p-4">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              <Icon name={r.subjectType === "post" ? "draft" : "user"} size={12} />
              {r.subjectType === "post" ? "Post" : "Account"}
            </span>
            {#if subjectHref(r)}
              <a href={subjectHref(r)} class="font-medium text-foreground hover:underline">
                {subjectLabel(r)}
              </a>
            {:else}
              <span class="font-medium text-muted-foreground">{subjectLabel(r)}</span>
            {/if}
            <span class="ml-auto text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
          </div>

          {#if r.reason}
            <p class="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.reason}</p>
          {:else}
            <p class="mt-2 text-sm italic text-muted-foreground">No reason given.</p>
          {/if}

          <p class="mt-2 text-xs text-muted-foreground">
            Reported by {r.reporter ? `@${r.reporter.username}` : "a deleted account"}
          </p>

          {#if r.status === "resolved"}
            {#if r.resolution}
              <p class="mt-2 text-xs text-muted-foreground">
                <Icon name="check" size={12} /> Resolved — {r.resolution}
              </p>
            {/if}
          {:else}
            <div class="mt-3 flex flex-wrap gap-2">
              {#if r.subjectType === "post" && r.postId}
                <Button variant="destructive" size="sm" disabled={busyId === r.id} onclick={() => removePost(r)}>
                  <Icon name="trash" size={15} /> Remove post
                </Button>
              {/if}
              {#if r.subjectType === "user" && r.userId}
                <Button variant="destructive" size="sm" disabled={busyId === r.id} onclick={() => suspendAuthor(r)}>
                  <Icon name="shieldOff" size={15} /> Suspend account
                </Button>
              {/if}
              <Button variant="outline" size="sm" disabled={busyId === r.id} onclick={() => resolve(r)}>
                <Icon name="check" size={15} /> Dismiss
              </Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
