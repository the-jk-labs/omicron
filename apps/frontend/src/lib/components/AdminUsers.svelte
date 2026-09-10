<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Time from "$lib/components/Time.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import type { AdminUser, AdminUserDetail, DeletedUser } from "$lib/types";
  import { Dialog, Label } from "bits-ui";

  // The signed-in admin's own id, so the row for self can hide every action
  // (the server also forbids them).
  let { selfId }: { selfId: string } = $props();

  let users = $state<AdminUser[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let busyId = $state<string | null>(null);

  // Recently deleted accounts: the retention window's restore list.
  let deleted = $state<DeletedUser[]>([]);
  let deletedLoading = $state(true);
  let deletedError = $state("");

  // GitHub-style delete confirmation: type the account's username and re-enter
  // the admin's own password. Both travel with the request; the server
  // re-verifies them before anything is deleted.
  let deleteTarget = $state<AdminUser | null>(null);
  let deleteUsername = $state("");
  let deletePassword = $state("");
  let deleteError = $state("");
  let deleteBusy = $state(false);

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await endpoints().adminUsers(query.trim() || undefined);
      users = res.users;
      total = res.total;
      // Mutations may have changed what a detail shows; drop the cache so an
      // expansion always refetches.
      details = {};
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load users.";
    } finally {
      loading = false;
    }
  }

  async function loadDeleted() {
    deletedLoading = true;
    deletedError = "";
    try {
      deleted = (await endpoints().deletedUsers()).users;
    } catch (e) {
      deletedError = e instanceof ApiError ? e.message : "Failed to load deleted accounts.";
    } finally {
      deletedLoading = false;
    }
  }

  $effect(() => {
    load();
    loadDeleted();
  });

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }

  async function toggleSuspend(u: AdminUser) {
    const suspend = !u.suspended;
    const ok = await confirm({
      title: suspend ? `Suspend @${u.username}?` : `Reinstate @${u.username}?`,
      description: suspend
        ? "They will be signed out and unable to sign in until reinstated."
        : "They will be able to sign in again.",
      confirmText: suspend ? "Suspend" : "Reinstate",
      destructive: suspend,
    });
    if (!ok) return;
    busyId = u.id;
    try {
      await endpoints().suspendUser(u.id, suspend);
      // Replace the row immutably rather than mutating the loop item in place,
      // so the badge and button reliably re-render with the new state.
      users = users.map((x) => (x.id === u.id ? { ...x, suspended: suspend } : x));
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Action failed.";
    } finally {
      busyId = null;
    }
  }

  function openDelete(u: AdminUser) {
    deleteTarget = u;
    deleteUsername = "";
    deletePassword = "";
    deleteError = "";
  }

  function onDeleteOpenChange(open: boolean) {
    if (!open) deleteTarget = null;
  }

  const deleteReady = $derived(
    deleteTarget !== null && deleteUsername.trim() === deleteTarget.username && deletePassword.length > 0,
  );

  async function confirmDelete() {
    if (!deleteTarget || !deleteReady || deleteBusy) return;
    deleteBusy = true;
    deleteError = "";
    try {
      await endpoints().deleteUser(deleteTarget.id, {
        username: deleteUsername.trim(),
        password: deletePassword,
      });
      users = users.filter((x) => x.id !== deleteTarget!.id);
      deleteTarget = null;
      await loadDeleted();
    } catch (e) {
      deleteError = e instanceof ApiError ? e.message : "Delete failed.";
    } finally {
      deleteBusy = false;
    }
  }

  // Admin-role change: password re-verified server-side, like deletion minus
  // the username typing (the target is already picked, and it is reversible).
  let roleTarget = $state<AdminUser | null>(null);
  let rolePassword = $state("");
  let roleError = $state("");
  let roleBusy = $state(false);

  function openRole(u: AdminUser) {
    roleTarget = u;
    rolePassword = "";
    roleError = "";
  }

  function onRoleOpenChange(open: boolean) {
    if (!open) roleTarget = null;
  }

  const roleReady = $derived(roleTarget !== null && rolePassword.length > 0);

  async function confirmRole() {
    if (!roleTarget || !roleReady || roleBusy) return;
    const makeAdmin = !roleTarget.isAdmin;
    roleBusy = true;
    roleError = "";
    try {
      await endpoints().setUserRole(roleTarget.id, { makeAdmin, password: rolePassword });
      const id = roleTarget.id;
      users = users.map((x) => (x.id === id ? { ...x, isAdmin: makeAdmin } : x));
      roleTarget = null;
    } catch (e) {
      roleError = e instanceof ApiError ? e.message : "Role change failed.";
    } finally {
      roleBusy = false;
    }
  }

  // Expandable per-account detail: counts, latest posts and reports against
  // the account or its posts. Loaded lazily on expand and cached until the
  // next table reload.
  let expandedId = $state<string | null>(null);
  let details = $state<Record<string, AdminUserDetail>>({});
  let detailLoadingId = $state<string | null>(null);

  async function toggleDetail(u: AdminUser) {
    if (expandedId === u.id) {
      expandedId = null;
      return;
    }
    expandedId = u.id;
    if (details[u.id] || detailLoadingId === u.id) return;
    detailLoadingId = u.id;
    try {
      details[u.id] = await endpoints().adminUserDetail(u.id);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load account detail.";
      expandedId = null;
    } finally {
      detailLoadingId = null;
    }
  }

  async function restoreDeleted(d: DeletedUser) {
    busyId = d.id;
    error = "";
    try {
      await endpoints().restoreUser(d.id);
      deleted = deleted.filter((x) => x.id !== d.id);
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Restore failed.";
    } finally {
      busyId = null;
    }
  }

  async function purgeDeleted(d: DeletedUser) {
    const ok = await confirm({
      title: `Erase @${d.username} forever?`,
      description:
        "The account, its posts and all of its data will be permanently erased immediately. This cannot be undone.",
      confirmText: "Erase forever",
      destructive: true,
    });
    if (!ok) return;
    busyId = d.id;
    try {
      await endpoints().purgeDeletedUser(d.id);
      deleted = deleted.filter((x) => x.id !== d.id);
    } catch (e) {
      deletedError = e instanceof ApiError ? e.message : "Erase failed.";
    } finally {
      busyId = null;
    }
  }

  // Whole days until the retention window ends, for the "expires in N days" label.
  function daysLeft(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2 text-sm text-muted-foreground">
    <Icon name="users" size={16} />
    {#if loading}
      <span>Loading accounts…</span>
    {:else if query.trim()}
      <span>{users.length} of {total} {total === 1 ? "account" : "accounts"}</span>
    {:else}
      <span>{total} {total === 1 ? "account" : "accounts"} total</span>
    {/if}
  </div>

  <div class="relative">
    <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
      <Icon name="search" size={16} />
    </span>
    <input
      bind:value={query}
      oninput={onSearch}
      placeholder="Search by handle or name"
      class="w-full rounded-input border border-input bg-background py-2.5 pr-3.5 pl-9 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
    />
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
  {:else if users.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">No accounts found.</p>
  {:else}
    <ul class="flex flex-col divide-y divide-border">
      {#each users as u (u.id)}
        <li class="py-3">
          <div class="flex items-center gap-3">
            <Button
              variant="plain"
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-input text-muted-foreground hover:bg-muted"
              onclick={() => toggleDetail(u)}
              aria-expanded={expandedId === u.id}
              aria-label={expandedId === u.id ? `Hide detail for @${u.username}` : `Show detail for @${u.username}`}
            >
              <Icon name="chevronDown" size={16} class={expandedId === u.id ? "rotate-180" : ""} />
            </Button>
            <Avatar name={u.displayName} src={u.avatarUrl ?? undefined} size={40} />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <a href={`/@${u.username}`} class="truncate font-medium text-foreground hover:underline">
                  {u.displayName}
                </a>
                {#if u.isAdmin}
                  <span
                    class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <Icon name="admin" size={12} /> Admin
                  </span>
                {/if}
                {#if u.suspended}
                  <span class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Suspended
                  </span>
                {/if}
              </div>
              <p class="truncate text-xs text-muted-foreground">
                @{u.username} · {u.email} · joined <Time iso={u.createdAt} kind="date" />
              </p>
            </div>
            {#if u.id !== selfId}
              <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {#if !u.isAdmin}
                  <Button
                    variant={u.suspended ? "outline" : "destructive"}
                    size="sm"
                    disabled={busyId === u.id}
                    onclick={() => toggleSuspend(u)}
                  >
                    <Icon name={u.suspended ? "check" : "shieldOff"} size={15} />
                    {u.suspended ? "Reinstate" : "Suspend"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busyId === u.id} onclick={() => openDelete(u)}>
                    <Icon name="trash" size={15} />
                    Delete
                  </Button>
                {/if}
                <Button variant="outline" size="sm" disabled={busyId === u.id} onclick={() => openRole(u)}>
                  <Icon name="admin" size={15} />
                  {u.isAdmin ? "Remove admin" : "Make admin"}
                </Button>
              </div>
            {/if}
          </div>
          {#if expandedId === u.id}
            <div class="mt-3 ml-10 rounded-card border border-border bg-background-alt p-4">
              {#if detailLoadingId === u.id}
                <p class="text-sm text-muted-foreground">Loading detail…</p>
              {:else if details[u.id]}
                {@const d = details[u.id]}
                <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span><strong class="text-foreground">{d.postCounts.published}</strong> published</span>
                  <span
                    ><strong class="text-foreground">{d.postCounts.draft + d.postCounts.scheduled}</strong> drafts</span
                  >
                  <span><strong class="text-foreground">{d.followCounts.followers}</strong> followers</span>
                  <span><strong class="text-foreground">{d.followCounts.following}</strong> following</span>
                  <span>{d.user.emailVerified ? "Email verified" : "Email unverified"}</span>
                </div>
                <h4 class="mt-4 text-sm font-semibold text-foreground">Latest posts</h4>
                {#if d.recentPosts.length === 0}
                  <p class="mt-1 text-sm text-muted-foreground">No posts yet.</p>
                {:else}
                  <ul class="mt-1 flex flex-col gap-1">
                    {#each d.recentPosts as p (p.id)}
                      <li class="flex items-center gap-2 text-sm">
                        <a href={`/posts/${p.id}`} class="truncate font-medium text-foreground hover:underline">
                          {p.title ?? "Untitled"}
                        </a>
                        <span class="shrink-0 text-xs text-muted-foreground">
                          {p.status} · <Time iso={p.createdAt} kind="date" />
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <h4 class="mt-4 text-sm font-semibold text-foreground">
                  Reports {d.reports.length > 0 ? `(${d.reports.length})` : ""}
                </h4>
                {#if d.reports.length === 0}
                  <p class="mt-1 text-sm text-muted-foreground">Nothing filed against this account.</p>
                {:else}
                  <ul class="mt-1 flex flex-col gap-2">
                    {#each d.reports as r (r.id)}
                      <li class="text-sm">
                        <span
                          class={r.status === "open"
                            ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}
                        >
                          {r.status}
                        </span>
                        <span class="text-foreground">
                          {r.subjectType === "post" ? `Post “${r.postTitle ?? "untitled"}”` : "Account"}
                        </span>
                        <span class="text-muted-foreground">
                          — {r.reason || "No reason given"} · by {r.reporter
                            ? `@${r.reporter.username}`
                            : "a deleted account"} ·
                          <Time iso={r.createdAt} kind="date" />
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="mt-4 border-t border-border pt-4">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="clock" size={16} />
      {#if deletedLoading}
        <span>Loading recently deleted…</span>
      {:else}
        <span>
          Recently deleted{deleted.length > 0 ? ` (${deleted.length})` : ""} — restorable until the retention window ends
        </span>
      {/if}
    </div>

    {#if deletedError}<p class="mt-2 text-sm text-destructive">{deletedError}</p>{/if}

    {#if !deletedLoading}
      {#if deleted.length === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">No deleted accounts.</p>
      {:else}
        <ul class="flex flex-col divide-y divide-border">
          {#each deleted as d (d.id)}
            <li class="flex items-center gap-3 py-3">
              <Avatar name={d.displayName} src={d.avatarUrl ?? undefined} size={40} />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-medium text-foreground">{d.displayName}</span>
                  <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Deleted
                  </span>
                </div>
                <p class="truncate text-xs text-muted-foreground">
                  @{d.username} · {d.email} · {d.postCount}
                  {d.postCount === 1 ? "post" : "posts"} kept
                </p>
                <p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="clock" size={12} />
                  Deleted <Time iso={d.deletedAt} kind="date" />{d.deletedBy ? ` by @${d.deletedBy}` : ""} · erased <Time
                    iso={d.expiresAt}
                    kind="date"
                  /> ({daysLeft(d.expiresAt)}
                  {daysLeft(d.expiresAt) === 1 ? "day" : "days"} left)
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" disabled={busyId === d.id} onclick={() => restoreDeleted(d)}>
                  <Icon name="check" size={15} />
                  Restore
                </Button>
                <Button variant="destructive" size="sm" disabled={busyId === d.id} onclick={() => purgeDeleted(d)}>
                  <Icon name="trash" size={15} />
                  Erase
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

<Dialog.Root open={deleteTarget !== null} onOpenChange={onDeleteOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
        Delete @{deleteTarget?.username}?
      </Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        This signs them out immediately and hides the account, its posts and its profile everywhere. They will be
        notified by email. The data is kept for a limited time and can be restored from Recently deleted below.
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="delete-username" class={labelClass}>
            Type <strong class="text-foreground">{deleteTarget?.username}</strong> to confirm
          </Label.Root>
          <input
            id="delete-username"
            bind:value={deleteUsername}
            placeholder={deleteTarget?.username ?? ""}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            class={field}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="delete-password" class={labelClass}>Your password</Label.Root>
          <input
            id="delete-password"
            type="password"
            bind:value={deletePassword}
            autocomplete="current-password"
            class={field}
          />
        </div>
        {#if deleteError}<p class="text-sm text-destructive">{deleteError}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button variant="destructive" disabled={!deleteReady || deleteBusy} onclick={confirmDelete}>
          {deleteBusy ? "Deleting…" : "Delete this account"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root open={roleTarget !== null} onOpenChange={onRoleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
        {roleTarget?.isAdmin
          ? `Remove @${roleTarget?.username}'s admin role?`
          : `Make @${roleTarget?.username} an admin?`}
      </Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        {#if roleTarget?.isAdmin}
          They lose access to the admin panel immediately. Everything else stays as is. They will be notified by email.
        {:else}
          They gain the admin panel: reports, accounts, defederation and instance settings — including other people's
          login emails. They will be notified by email.
        {/if}
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-1.5">
        <Label.Root for="role-password" class={labelClass}>Your password</Label.Root>
        <input
          id="role-password"
          type="password"
          bind:value={rolePassword}
          autocomplete="current-password"
          class={field}
        />
        {#if roleError}<p class="text-sm text-destructive">{roleError}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button
          variant={roleTarget?.isAdmin ? "destructive" : "solid"}
          disabled={!roleReady || roleBusy}
          onclick={confirmRole}
        >
          {roleBusy ? "Saving…" : roleTarget?.isAdmin ? "Remove admin" : "Make admin"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
