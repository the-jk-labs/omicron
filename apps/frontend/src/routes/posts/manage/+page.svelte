<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll, replaceState } from "$app/navigation";
  import { ApiError, endpoints } from "$lib/api";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import ScheduleDialog from "$lib/components/ScheduleDialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import { excerpt, formatDateTime, formatScheduleLong, timeUntil } from "$lib/format";
  import { postPath } from "$lib/links";
  import { timeZone } from "$lib/timezone";
  import type { OwnPostStatus, Post } from "$lib/types";
  import { DropdownMenu, Tabs } from "bits-ui";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Everything an author has written, in one place. The three tabs are the same
  // list under three filters, so they share one row renderer and differ only in
  // what each row's timestamp means and which actions make sense on it.
  // `noun` is what a row on this tab is called in a confirmation prompt —
  // "Delete draft" and "Delete post" are different enough decisions that the
  // dialog should not word both the same way.
  type Tab = {
    value: OwnPostStatus;
    label: string;
    icon: IconName;
    noun: string;
    empty: string;
  };
  const tabs: Tab[] = [
    {
      value: "draft",
      label: "Drafts",
      icon: "draft",
      noun: "draft",
      empty: "You don't have any drafts yet.",
    },
    {
      value: "scheduled",
      label: "Scheduled",
      icon: "clock",
      noun: "scheduled post",
      empty: "Nothing is waiting to go out. Schedule a draft and it will appear here.",
    },
    {
      value: "published",
      label: "Published",
      icon: "globe",
      noun: "post",
      empty: "You haven't published anything yet.",
    },
  ];

  // Each tab is loaded independently and kept: switching back and forth must not
  // refetch, and "load more" on one tab must not be undone by opening another.
  type Lane = { items: Post[]; cursor: string | null; loaded: boolean; loading: boolean };
  const blank = (): Lane => ({ items: [], cursor: null, loaded: false, loading: false });

  // Seeded synchronously rather than from the effect below, because effects do
  // not run during SSR: leaving it to the effect rendered every tab's empty
  // state on the server and only filled the list in once the page hydrated, so
  // the author was briefly told they had written nothing.
  function seeded(): Record<OwnPostStatus, Lane> {
    const next = { draft: blank(), scheduled: blank(), published: blank() };
    next[data.tab] = {
      items: data.page.items,
      cursor: data.page.nextCursor,
      loaded: true,
      loading: false,
    };
    return next;
  }

  let lanes = $state<Record<OwnPostStatus, Lane>>(untrack(seeded));
  let active = $state<OwnPostStatus>(untrack(() => data.tab));
  let counts = $state(untrack(() => data.counts));
  let error = $state("");

  // Re-seed whenever the server load runs again — which is what an action that
  // moved a post between tabs triggers, so the list and the badges refresh
  // together instead of one going stale behind the other.
  $effect(() => {
    lanes[data.tab] = { items: data.page.items, cursor: data.page.nextCursor, loaded: true, loading: false };
    counts = data.counts;
    active = data.tab;
  });

  async function ensureLoaded(value: string) {
    const status = value as OwnPostStatus;
    active = status;
    // Keep the address bar in step, so a reload reopens the tab the author was
    // actually looking at. `replaceState` rather than `goto`: a navigation would
    // re-run the server load, which both duplicates the fetch below and resets
    // whatever this tab had already paged in.
    replaceState(`/posts/manage?tab=${status}`, {});
    if (lanes[status].loaded || lanes[status].loading) return;
    lanes[status].loading = true;
    try {
      const page = await endpoints().ownPosts(status);
      lanes[status] = { items: page.items, cursor: page.nextCursor, loaded: true, loading: false };
    } catch (err) {
      lanes[status].loading = false;
      error = message(err, "Failed to load posts.");
    }
  }

  async function loadMore(status: OwnPostStatus) {
    const lane = lanes[status];
    if (!lane.cursor || lane.loading) return;
    lane.loading = true;
    try {
      const next = await endpoints().ownPosts(status, lane.cursor);
      lane.items = [...lane.items, ...next.items];
      lane.cursor = next.nextCursor;
    } catch (err) {
      error = message(err, "Failed to load more.");
    } finally {
      lane.loading = false;
    }
  }

  function message(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback;
  }

  // Moving a post between states changes two lists and two counts at once, so
  // rather than patch both by hand every action reloads the page data — one
  // request, and no chance of the badges disagreeing with the lists.
  //
  // The two tabs that are not on screen are dropped so they refetch when next
  // opened. The visible one is deliberately left alone: the reload replaces it
  // a moment later, and blanking it first would flash "you don't have any
  // drafts yet" over a list that is about to come back.
  async function act(run: () => Promise<unknown>, fallback: string) {
    error = "";
    try {
      await run();
      for (const tab of tabs) if (tab.value !== active) lanes[tab.value] = blank();
      await invalidateAll();
    } catch (err) {
      error = message(err, fallback);
    }
  }

  function publishNow(post: Post) {
    return act(() => endpoints().updatePost(post.id, { status: "published" }), "Failed to publish.");
  }

  function unschedule(post: Post) {
    return act(() => endpoints().updatePost(post.id, { status: "draft" }), "Failed to unschedule.");
  }

  function reschedule(post: Post, at: string) {
    return act(() => endpoints().updatePost(post.id, { status: "scheduled", publishAt: at }), "Failed to reschedule.");
  }

  async function unpublish(post: Post) {
    const ok = await confirm({
      title: "Unpublish post",
      description:
        "This takes the post off the site and tells other instances to remove their copy. It becomes a draft you can publish again.",
      confirmText: "Unpublish",
      destructive: true,
    });
    if (!ok) return;
    await act(() => endpoints().updatePost(post.id, { status: "draft" }), "Failed to unpublish.");
  }

  async function remove(post: Post, kind: string) {
    const ok = await confirm({
      title: `Delete ${kind}`,
      description: `Delete this ${kind}? This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await act(() => endpoints().deletePost(post.id), "Failed to delete.");
  }

  // Rescheduling opens the shared dialog against whichever row asked for it.
  let rescheduling = $state<Post | null>(null);
  let rescheduleOpen = $state(false);

  function openReschedule(post: Post) {
    rescheduling = post;
    rescheduleOpen = true;
  }

  const menuItemClass =
    "flex h-10 cursor-pointer items-center gap-2 rounded-button px-3 text-sm font-medium text-foreground select-none data-highlighted:bg-muted focus-visible:outline-hidden";
  const destructiveItemClass = menuItemClass.replace("text-foreground", "text-destructive");
</script>

<PageTitle text="Your posts" />

<header class="mb-6">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="compose" size={22} /> Your posts
  </h1>
  <p class="mt-1 text-muted-foreground">Everything you've written — drafts, scheduled and live.</p>
</header>

{#if error}<p class="mb-4 text-sm text-destructive">{error}</p>{/if}

<Tabs.Root value={active} onValueChange={ensureLoaded} class="w-full">
  <Tabs.List class="mb-2 flex items-center gap-6 border-b border-border text-sm font-medium">
    {#each tabs as tab (tab.value)}
      <Tabs.Trigger
        value={tab.value}
        class="-mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
      >
        <Icon name={tab.icon} size={16} />
        {tab.label}
        {#if counts[tab.value] > 0}
          <span class="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {counts[tab.value]}
          </span>
        {/if}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>

  {#each tabs as tab (tab.value)}
    <Tabs.Content value={tab.value} class="pt-3">
      {@render lane(tab)}
    </Tabs.Content>
  {/each}
</Tabs.Root>

<ScheduleDialog
  bind:open={rescheduleOpen}
  current={rescheduling?.publishAt ?? null}
  onconfirm={(at) => rescheduling && reschedule(rescheduling, at)}
/>

{#snippet lane(tab: Tab)}
  {@const pane = lanes[tab.value]}
  {#if !pane.loaded}
    <!-- Not an empty state: a tab that has not been fetched knows nothing about
         whether it is empty, and saying it is would be a guess that is wrong as
         often as the author has posts. -->
    <p class="px-4 py-12 text-center text-muted-foreground">Loading…</p>
  {:else if pane.items.length === 0}
    <div class="rounded-card border border-border bg-background-alt px-6 py-12 text-center">
      <p class="text-muted-foreground">{tab.empty}</p>
      {#if tab.value !== "published"}
        <Button href="/compose" variant="solid" class="mt-4">Start writing</Button>
      {/if}
    </div>
  {:else}
    <ul class="space-y-2">
      {#each pane.items as post (post.id)}
        <li class="flex items-start justify-between gap-4 rounded-card px-4 py-5 transition-colors hover:bg-muted">
          <Button
            href={tab.value === "published" ? postPath(post) : `/compose?id=${post.id}`}
            variant="plain"
            class="group block min-w-0 flex-1 text-left"
          >
            <h2 class="truncate text-xl leading-snug font-bold text-foreground group-hover:text-foreground-alt">
              {post.title?.trim() || "Untitled draft"}
            </h2>
            {#if excerpt(post.contentHtml)}
              <p class="mt-1.5 line-clamp-2 text-muted-foreground">{excerpt(post.contentHtml)}</p>
            {/if}
            <span class="mt-3 block text-xs text-muted-foreground">
              {#if tab.value === "scheduled" && post.publishAt}
                <!-- The one row whose timestamp is a promise rather than a
                     record, so it says both when and how soon. -->
                <span class="inline-flex items-center gap-1 font-medium text-foreground">
                  <Icon name="clock" size={12} />
                  Publishes {formatScheduleLong(post.publishAt, $timeZone)}
                </span>
                · {timeUntil(post.publishAt)}
              {:else if tab.value === "published"}
                Published {formatDateTime(post.createdAt, $timeZone)}
              {:else}
                Last edited {formatDateTime(post.updatedAt ?? post.createdAt, $timeZone)}
              {/if}
            </span>
          </Button>

          <div class="flex shrink-0 items-center gap-2 self-center">
            {#if tab.value === "published"}
              <Button href={`/posts/${post.id}/edit`} variant="outline" size="sm">
                <Icon name="edit" size={15} /> Edit
              </Button>
            {:else}
              <Button href={`/compose?id=${post.id}`} variant="outline" size="sm">
                <Icon name="edit" size={15} /> Continue
              </Button>
            {/if}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    aria-label="More actions"
                    class="inline-flex size-9 items-center justify-center px-0! text-muted-foreground"
                  >
                    <Icon name="more" size={16} />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  class="z-50 w-52 rounded-card border border-border bg-background p-1 shadow-popover focus-visible:outline-hidden"
                >
                  {#if tab.value === "scheduled"}
                    <DropdownMenu.Item onSelect={() => openReschedule(post)} class={menuItemClass}>
                      <Icon name="clock" size={16} /> Reschedule…
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => publishNow(post)} class={menuItemClass}>
                      <Icon name="globe" size={16} /> Publish now
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => unschedule(post)} class={menuItemClass}>
                      <Icon name="draft" size={16} /> Unschedule
                    </DropdownMenu.Item>
                  {:else if tab.value === "draft"}
                    <DropdownMenu.Item onSelect={() => openReschedule(post)} class={menuItemClass}>
                      <Icon name="clock" size={16} /> Schedule…
                    </DropdownMenu.Item>
                  {:else}
                    <DropdownMenu.Item onSelect={() => goto(postPath(post))} class={menuItemClass}>
                      <Icon name="globe" size={16} /> View post
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => unpublish(post)} class={menuItemClass}>
                      <Icon name="draft" size={16} /> Unpublish
                    </DropdownMenu.Item>
                  {/if}
                  <DropdownMenu.Separator class="my-1 h-px bg-border" />
                  <DropdownMenu.Item onSelect={() => remove(post, tab.noun)} class={destructiveItemClass}>
                    <Icon name="trash" size={16} /> Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </li>
      {/each}
    </ul>

    {#if pane.cursor}
      <div class="mt-8 flex justify-center">
        <Button onclick={() => loadMore(tab.value)} disabled={pane.loading} variant="outline">
          {pane.loading ? "Loading…" : "Load more"}
        </Button>
      </div>
    {/if}
  {/if}
{/snippet}
