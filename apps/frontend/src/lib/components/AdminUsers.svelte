<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import CustomSectionEditor from "$lib/components/CustomSectionEditor.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import ProfileLinksEditor from "$lib/components/ProfileLinksEditor.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import Time from "$lib/components/Time.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import { identifierToUrl, platformMeta, urlToIdentifier } from "$lib/profileLinks";
  import { MAX_PROFILE_TAGS } from "$lib/tags";
  import type { AdminUser, AdminUserDetail, DeletedUser, ProfileLink } from "$lib/types";
  import { Dialog, DropdownMenu, Label, ToggleGroup } from "bits-ui";
  import { onMount } from "svelte";

  // The signed-in admin's own id, so the row for self can hide every action
  // (the server also forbids them).
  let { selfId }: { selfId: string } = $props();

  let users = $state<AdminUser[]>([]);
  let total = $state(0);
  let filteredTotal = $state(0);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state("");
  let query = $state("");
  let busyId = $state<string | null>(null);
  // Monotonic request id: only the latest list response may write state, so a
  // slow search can never overwrite a newer one.
  let loadSeq = 0;

  // Triage filters, tri-state: `undefined` shows all accounts, `true` only
  // matching ones, `false` only the rest. The backend speaks the same shape.
  type TriFilter = boolean | undefined;
  let fSuspended = $state<TriFilter>(undefined);
  let fAdmins = $state<TriFilter>(undefined);
  let fVerified = $state<TriFilter>(undefined);

  function triValue(v: TriFilter): string {
    return v === undefined ? "all" : v ? "yes" : "no";
  }

  function onTriChange(set: (v: TriFilter) => void, raw: string) {
    // Single-select deselects to "" when the active option is clicked — that
    // also means "all".
    set(raw === "all" || raw === "" ? undefined : raw === "yes");
    load(true);
  }

  // Recently deleted accounts: the retention window's restore list, newest
  // deletion first, cursor-paginated like the live table.
  let deleted = $state<DeletedUser[]>([]);
  let deletedTotal = $state(0);
  let deletedNextCursor = $state<string | null>(null);
  let deletedLoading = $state(true);
  let deletedLoadingMore = $state(false);
  let deletedError = $state("");
  let deletedSeq = 0;

  // GitHub-style delete confirmation: type the account's username and re-enter
  // the admin's own password. Both travel with the request; the server
  // re-verifies them before anything is deleted.
  let deleteTarget = $state<AdminUser | null>(null);
  let deleteUsername = $state("");
  let deletePassword = $state("");
  let deleteError = $state("");
  let deleteBusy = $state(false);

  // Cursor-paginated table load. `reset` fetches the first page (new search or
  // filter change); otherwise appends the next page. Stale responses are
  // dropped via `loadSeq`, and the detail cache is kept — mutations update it
  // in place, so an expansion survives a reload.
  function filterParams() {
    return { suspended: fSuspended, admin: fAdmins, verified: fVerified };
  }

  async function load(reset = true) {
    const my = ++loadSeq;
    if (reset) {
      loading = true;
      nextCursor = null;
      error = "";
    } else {
      if (!nextCursor || loadingMore) return;
      loadingMore = true;
    }
    try {
      const res = await endpoints().adminUsers(query.trim() || undefined, filterParams(), {
        cursor: reset ? null : nextCursor,
      });
      if (my !== loadSeq) return;
      users = reset ? res.users : [...users, ...res.users.filter((u) => !users.some((x) => x.id === u.id))];
      total = res.total;
      filteredTotal = res.filteredTotal;
      nextCursor = res.nextCursor;
      detailNotice = "";
    } catch (e) {
      if (my !== loadSeq) return;
      if (reset) users = [];
      error = e instanceof ApiError ? e.message : "Failed to load users.";
    } finally {
      if (my === loadSeq) {
        loading = false;
        loadingMore = false;
      }
    }
  }

  async function loadDeleted(reset = true) {
    const my = ++deletedSeq;
    if (reset) {
      deletedLoading = true;
      deletedNextCursor = null;
      deletedError = "";
    } else {
      if (!deletedNextCursor || deletedLoadingMore) return;
      deletedLoadingMore = true;
    }
    try {
      const res = await endpoints().deletedUsers(reset ? null : deletedNextCursor);
      if (my !== deletedSeq) return;
      deleted = reset ? res.users : [...deleted, ...res.users.filter((d) => !deleted.some((x) => x.id === d.id))];
      deletedTotal = res.total;
      deletedNextCursor = res.nextCursor;
    } catch (e) {
      if (my !== deletedSeq) return;
      if (reset) deleted = [];
      deletedError = e instanceof ApiError ? e.message : "Failed to load deleted accounts.";
    } finally {
      if (my === deletedSeq) {
        deletedLoading = false;
        deletedLoadingMore = false;
      }
    }
  }

  onMount(() => {
    load();
    loadDeleted();
  });

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 250);
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
      // The account leaves the listing when it no longer matches an active
      // Suspended filter (reinstated under "Yes", suspended under "No").
      if ((fSuspended === true && !suspend) || (fSuspended === false && suspend)) {
        users = users.filter((x) => x.id !== u.id);
        filteredTotal = Math.max(0, filteredTotal - 1);
        if (expandedId === u.id) expandedId = null;
      } else {
        users = users.map((x) => (x.id === u.id ? { ...x, suspended: suspend } : x));
      }
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
      const goneId = deleteTarget.id;
      users = users.filter((x) => x.id !== goneId);
      total = Math.max(0, total - 1);
      filteredTotal = Math.max(0, filteredTotal - 1);
      if (expandedId === goneId) expandedId = null;
      if (details[goneId]) {
        const { [goneId]: _, ...rest } = details;
        details = rest;
      }
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
      // The account leaves the listing when it no longer matches an active
      // Admin filter (demoted under "Yes", promoted under "No").
      if ((fAdmins === true && !makeAdmin) || (fAdmins === false && makeAdmin)) {
        users = users.filter((x) => x.id !== id);
        filteredTotal = Math.max(0, filteredTotal - 1);
        if (expandedId === id) expandedId = null;
      } else {
        users = users.map((x) => (x.id === id ? { ...x, isAdmin: makeAdmin } : x));
      }
      roleTarget = null;
    } catch (e) {
      roleError = e instanceof ApiError ? e.message : "Role change failed.";
    } finally {
      roleBusy = false;
    }
  }

  // Expandable per-account detail: counts, latest posts and reports against
  // the account or its posts. Loaded lazily on expand and cached; mutations
  // update the cache in place, and reloads keep it.
  let expandedId = $state<string | null>(null);
  let details = $state<Record<string, AdminUserDetail>>({});
  let detailLoadingId = $state<string | null>(null);

  async function toggleDetail(u: AdminUser) {
    if (expandedId === u.id) {
      expandedId = null;
      return;
    }
    expandedId = u.id;
    detailNotice = "";
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

  // Verification actions live in the expanded detail, next to the state they
  // act on. Resending just sends mail; marking verified overrides a security
  // gate, so it gets a confirmation dialog.
  let verifyBusyId = $state<string | null>(null);
  let detailNotice = $state("");

  async function resendVerification(u: AdminUser) {
    verifyBusyId = u.id;
    detailNotice = "";
    try {
      await endpoints().resendVerification(u.id);
      detailNotice = "Verification email sent.";
    } catch (e) {
      detailNotice = e instanceof ApiError ? e.message : "Sending failed.";
    } finally {
      verifyBusyId = null;
    }
  }

  async function markVerified(u: AdminUser) {
    const ok = await confirm({
      title: `Mark @${u.username}'s email verified?`,
      description:
        "They will be able to sign in without clicking a link. Use this when instance mail was broken — not to skip ownership proof lightly.",
      confirmText: "Mark verified",
    });
    if (!ok) return;
    verifyBusyId = u.id;
    detailNotice = "";
    try {
      await endpoints().verifyEmail(u.id);
      // A verified account no longer matches the Verified "No" filter.
      if (fVerified === false) {
        users = users.filter((x) => x.id !== u.id);
        filteredTotal = Math.max(0, filteredTotal - 1);
        if (expandedId === u.id) expandedId = null;
        detailNotice = "";
      } else {
        users = users.map((x) => (x.id === u.id ? { ...x, emailVerified: true } : x));
        if (details[u.id]) details[u.id] = { ...details[u.id], user: { ...details[u.id].user, emailVerified: true } };
        detailNotice = "Email marked verified.";
      }
    } catch (e) {
      detailNotice = e instanceof ApiError ? e.message : "Action failed.";
    } finally {
      verifyBusyId = null;
    }
  }

  // Admin edit: patch another account's profile + login email. Seeded from the
  // expanded detail when present (it carries tags/links), otherwise from the
  // table row. Links are edited as identifiers and converted back to canonical
  // URLs on save, mirroring the Settings form.
  const MAX_CUSTOM_SECTION_LEN = 20_000;
  let editTarget = $state<AdminUser | null>(null);
  let editDisplayName = $state("");
  let editBio = $state("");
  let editEmail = $state("");
  let editPublicEmail = $state("");
  let editCustomSection = $state("");
  let editTags = $state<string[]>([]);
  let editLinks = $state<ProfileLink[]>([]);
  let editInitial = $state("");
  let editError = $state("");
  let editBusy = $state(false);

  async function openEdit(u: AdminUser) {
    editTarget = u;
    editError = "";
    editBusy = false;
    if (!details[u.id] && detailLoadingId !== u.id) {
      detailLoadingId = u.id;
      try {
        details[u.id] = await endpoints().adminUserDetail(u.id);
      } catch (e) {
        editError = e instanceof ApiError ? e.message : "Failed to load account detail.";
      } finally {
        detailLoadingId = null;
      }
    }
    const d = details[u.id];
    const row = d?.user ?? u;
    editDisplayName = row.displayName;
    editBio = row.bio ?? "";
    editEmail = row.email;
    editPublicEmail = row.publicEmail ?? "";
    editCustomSection = row.customSection ?? "";
    editTags = d?.tags?.map((t) => t.name) ?? [];
    editLinks = (d?.links ?? []).map((l) => ({
      platform: l.platform,
      url: urlToIdentifier(l.platform, l.url),
      label: l.label,
    }));
    editInitial = JSON.stringify({
      displayName: editDisplayName,
      bio: editBio,
      email: editEmail,
      publicEmail: editPublicEmail,
      customSection: editCustomSection,
      tags: editTags,
      links: editLinks,
    });
  }

  function onEditOpenChange(open: boolean) {
    if (!open) editTarget = null;
  }

  const editDirty = $derived(
    editTarget !== null &&
      JSON.stringify({
        displayName: editDisplayName,
        bio: editBio,
        email: editEmail,
        publicEmail: editPublicEmail,
        customSection: editCustomSection,
        tags: editTags,
        links: editLinks,
      }) !== editInitial,
  );

  async function saveEdit() {
    if (!editTarget || editBusy) return;
    editError = "";
    const displayName = editDisplayName.trim();
    if (displayName.length < 1 || displayName.length > 60) {
      editError = "Display name must be 1–60 characters.";
      return;
    }
    if (editBio.length > 500) {
      editError = "Bio must be 500 characters or fewer.";
      return;
    }
    const email = editEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      editError = "Enter a valid login email address.";
      return;
    }
    if (email.length > 254) {
      editError = "Email must be 254 characters or fewer.";
      return;
    }
    const publicEmail = editPublicEmail.trim();
    if (publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) {
      editError = "Enter a valid public email address, or leave it blank.";
      return;
    }
    if (editCustomSection.trim().length > MAX_CUSTOM_SECTION_LEN) {
      editError = `Custom section must be ${MAX_CUSTOM_SECTION_LEN.toLocaleString("en-US")} characters or fewer.`;
      return;
    }
    const links = [];
    for (const l of editLinks) {
      if (!l.url.trim()) continue;
      const url = identifierToUrl(l.platform, l.url);
      if (!url) {
        const meta = platformMeta(l.platform);
        editError = `Enter a valid ${meta.label} address.`;
        return;
      }
      links.push({ platform: l.platform, url, label: l.label.trim() });
    }
    const initial = JSON.parse(editInitial);
    const body: {
      displayName?: string;
      bio?: string;
      publicEmail?: string;
      customSection?: string;
      tags?: string[];
      links?: { platform: string; url: string; label: string }[];
      email?: string;
    } = {};
    if (displayName !== initial.displayName) body.displayName = displayName;
    if (editBio !== initial.bio) body.bio = editBio;
    if (email !== initial.email) body.email = email;
    if (publicEmail !== initial.publicEmail) body.publicEmail = publicEmail;
    if (editCustomSection !== initial.customSection) body.customSection = editCustomSection;
    if (JSON.stringify(editTags) !== JSON.stringify(initial.tags)) body.tags = editTags;
    if (JSON.stringify(editLinks) !== JSON.stringify(initial.links)) body.links = links;
    // Links with only blank rows removed still count as a change when the row
    // set differs; cover the case where the comparison above missed it because
    // blank rows were skipped during conversion.
    if (body.links === undefined && JSON.stringify(links) !== JSON.stringify(initial.links)) body.links = links;
    if (Object.keys(body).length === 0) {
      editTarget = null;
      return;
    }
    const target = editTarget;
    const emailChanged = body.email !== undefined && body.email.trim() !== initial.email;
    editBusy = true;
    try {
      const { user } = await endpoints().updateUserAsAdmin(target.id, body);
      users = users.map((x) => (x.id === target.id ? { ...x, ...user } : x));
      if (details[target.id]) {
        details[target.id] = {
          ...details[target.id],
          user: { ...details[target.id].user, ...user },
          tags: body.tags !== undefined ? body.tags.map((t) => ({ slug: t, name: t })) : details[target.id].tags,
          links: body.links !== undefined ? body.links : details[target.id].links,
        };
      }
      editTarget = null;
      detailNotice = emailChanged
        ? "Saved. Login email updated — a verification link was sent to the new address and the previous address was notified."
        : "Saved.";
      if (expandedId !== target.id) expandedId = target.id;
    } catch (e) {
      editError = e instanceof ApiError ? e.message : "Save failed.";
    } finally {
      editBusy = false;
    }
  }

  async function restoreDeleted(d: DeletedUser) {
    busyId = d.id;
    error = "";
    try {
      await endpoints().restoreUser(d.id);
      deleted = deleted.filter((x) => x.id !== d.id);
      deletedTotal = Math.max(0, deletedTotal - 1);
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
      deletedTotal = Math.max(0, deletedTotal - 1);
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
  const menuItemClass =
    "flex h-10 cursor-pointer items-center gap-2 rounded-button px-3 text-sm font-medium text-foreground select-none data-highlighted:bg-muted focus-visible:outline-hidden";
  const destructiveItemClass = menuItemClass.replace("text-foreground", "text-destructive");

  const isFiltering = $derived(
    query.trim() !== "" || fSuspended !== undefined || fAdmins !== undefined || fVerified !== undefined,
  );

  // Tri-state filter segments (All / Yes / No), rendered from one config so
  // the three dimensions stay visually identical.
  const triOptions = [
    { value: "all", label: "All" },
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ];
  const triFilters = $derived([
    { label: "Suspended", value: triValue(fSuspended), set: (v: TriFilter) => (fSuspended = v) },
    { label: "Admin", value: triValue(fAdmins), set: (v: TriFilter) => (fAdmins = v) },
    { label: "Verified", value: triValue(fVerified), set: (v: TriFilter) => (fVerified = v) },
  ]);
  const segItemClass =
    "h-7 rounded-button px-2.5 text-xs font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-mini focus-visible:outline-hidden";
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2 text-sm text-muted-foreground">
    <Icon name="users" size={16} />
    {#if loading}
      <span>Loading accounts…</span>
    {:else if isFiltering}
      <span>
        {filteredTotal} of {total}
        {total === 1 ? "account" : "accounts"} · showing {users.length}
      </span>
    {:else}
      <span>
        {total}
        {total === 1 ? "account" : "accounts"} total{nextCursor ? ` · showing ${users.length}` : ""}
      </span>
    {/if}
  </div>

  <div class="relative">
    <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
      <Icon name="search" size={16} />
    </span>
    <input
      type="search"
      bind:value={query}
      oninput={onSearch}
      placeholder="Search by handle, name, or email"
      aria-label="Search accounts by handle, name, or email"
      class="w-full rounded-input border border-input bg-background py-2.5 pr-3.5 pl-9 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
    />
  </div>

  <div class="flex flex-wrap gap-x-5 gap-y-3" role="group" aria-label="Filter accounts">
    {#each triFilters as f (f.label)}
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-muted-foreground">{f.label}</span>
        <ToggleGroup.Root
          type="single"
          value={f.value}
          onValueChange={(v) => onTriChange(f.set, v)}
          class="inline-flex items-center gap-0.5 rounded-input border border-input bg-background-alt p-0.5 shadow-btn"
        >
          {#each triOptions as o (o.value)}
            <ToggleGroup.Item value={o.value} aria-label={`${f.label}: ${o.label}`} class={segItemClass}>
              {o.label}
            </ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      </div>
    {/each}
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
              <div class="flex shrink-0 items-center gap-2">
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
                {/if}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger disabled={busyId === u.id}>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="outline"
                        size="sm"
                        aria-label={`More actions for @${u.username}`}
                        class="px-2!"
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
                      <DropdownMenu.Item onSelect={() => openEdit(u)} class={menuItemClass}>
                        <Icon name="edit" size={16} /> Edit profile…
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => openRole(u)} class={menuItemClass}>
                        <Icon name="admin" size={16} />
                        {u.isAdmin ? "Remove admin…" : "Make admin…"}
                      </DropdownMenu.Item>
                      {#if !u.isAdmin}
                        <DropdownMenu.Separator class="my-1 h-px bg-border" />
                        <DropdownMenu.Item onSelect={() => openDelete(u)} class={destructiveItemClass}>
                          <Icon name="trash" size={16} /> Delete…
                        </DropdownMenu.Item>
                      {/if}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
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
                  <span class="inline-flex flex-wrap items-center gap-2">
                    <span>{d.user.emailVerified ? "Email verified" : "Email unverified"}</span>
                    {#if !d.user.emailVerified}
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={verifyBusyId === u.id}
                        onclick={() => resendVerification(u)}
                      >
                        <Icon name="mail" size={13} />
                        Resend email
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={verifyBusyId === u.id}
                        onclick={() => markVerified(u)}
                      >
                        <Icon name="check" size={13} />
                        Mark verified
                      </Button>
                    {/if}
                  </span>
                </div>
                {#if detailNotice}<p class="mt-1 text-xs text-muted-foreground">{detailNotice}</p>{/if}
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
    {#if nextCursor}
      <div class="mt-4 flex justify-center">
        <Button variant="outline" size="sm" disabled={loadingMore} onclick={() => load(false)}>
          {loadingMore ? "Loading…" : `Load more (${users.length} of ${filteredTotal})`}
        </Button>
      </div>
    {/if}
  {/if}

  <div class="mt-4 border-t border-border pt-4">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="clock" size={16} />
      {#if deletedLoading}
        <span>Loading recently deleted…</span>
      {:else}
        <span>
          Recently deleted ({deletedTotal}) — restorable until the retention window ends{deletedNextCursor
            ? ` · showing ${deleted.length}`
            : ""}
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
        {#if deletedNextCursor}
          <div class="mt-4 flex justify-center">
            <Button variant="outline" size="sm" disabled={deletedLoadingMore} onclick={() => loadDeleted(false)}>
              {deletedLoadingMore ? "Loading…" : `Load more (${deleted.length} of ${deletedTotal})`}
            </Button>
          </div>
        {/if}
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

<Dialog.Root open={editTarget !== null} onOpenChange={onEditOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[560px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
        Edit @{editTarget?.username}
      </Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        Change how this account appears and which login email it uses. Changing the login email stores it unverified — a
        verification link goes to the new address and a security notice goes to the previous one.
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="edit-displayName" class={labelClass}>Display name</Label.Root>
          <input id="edit-displayName" bind:value={editDisplayName} maxlength={60} class={field} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="edit-bio" class={labelClass}>Bio</Label.Root>
          <textarea id="edit-bio" bind:value={editBio} rows={3} maxlength={500} class={`${field} resize-none`}
          ></textarea>
          <p class="self-end text-xs text-muted-foreground">{editBio.length}/500</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="edit-email" class={labelClass}>Login email</Label.Root>
          <input
            id="edit-email"
            type="email"
            bind:value={editEmail}
            maxlength={254}
            autocomplete="off"
            spellcheck={false}
            class={field}
          />
          <p class="text-xs text-muted-foreground">
            Private — used for sign-in and account recovery. Changing it requires the new address to be verified.
          </p>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="edit-publicEmail" class={labelClass}>Public email</Label.Root>
          <input
            id="edit-publicEmail"
            type="email"
            bind:value={editPublicEmail}
            maxlength={254}
            placeholder="you@example.com"
            autocomplete="off"
            spellcheck={false}
            class={field}
          />
          <p class="text-xs text-muted-foreground">Optional — shown on the profile. Leave blank to hide it.</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root class={labelClass}>Tags</Label.Root>
          <TagInput
            bind:tags={editTags}
            max={MAX_PROFILE_TAGS}
            hint="Topics they post about — shown on the profile and federated to other servers."
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root class={labelClass}>Links</Label.Root>
          <ProfileLinksEditor bind:links={editLinks} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root class={labelClass}>Custom section</Label.Root>
          <CustomSectionEditor bind:value={editCustomSection} maxLength={MAX_CUSTOM_SECTION_LEN} />
        </div>
        {#if editError}<p class="text-sm text-destructive">{editError}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button variant="solid" disabled={!editDirty || editBusy} onclick={saveEdit}>
          {editBusy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
