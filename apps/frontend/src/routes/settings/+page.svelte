<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Button as ButtonPrimitive, Dialog, Label } from "bits-ui";
  import EmojiTrigger from "$lib/components/EmojiTrigger.svelte";
  import { insertEmojiIntoField, emojiOverlayBtn } from "$lib/emoji";
  import { endpoints, ApiError } from "$lib/api";
  import { theme, type ThemePreference } from "$lib/theme.svelte";
  import { reading, type FeedTab } from "$lib/prefs.svelte";
  import { MAX_PROFILE_TAGS } from "$lib/tags";
  import { AVATAR_MAX_DIMENSION, prepareImage } from "$lib/editor/image";
  import { formatDate } from "$lib/format";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import ConnectionsManager from "$lib/components/ConnectionsManager.svelte";
  import FollowedTagsManager from "$lib/components/FollowedTagsManager.svelte";
  import InstanceModeration from "$lib/components/InstanceModeration.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import ProfileLinksEditor from "$lib/components/ProfileLinksEditor.svelte";
  import { identifierToUrl, platformMeta, urlToIdentifier } from "$lib/profileLinks";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { ProfileLink } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Profile form — seeded from the loaded user.
  let displayName = $state(data.user.displayName);
  let bio = $state(data.user.bio);
  let publicEmail = $state(data.user.publicEmail);
  let profileTags = $state<string[]>(data.user.tags?.map((t) => t.name) ?? []);
  const initialTags = (data.user.tags?.map((t) => t.name) ?? []).join(",");
  // The editor works in "identifier" form (a handle / username), so seed from
  // the stored canonical URLs and convert back on save. Deep-copied so edits
  // don't mutate the loaded page data.
  const toEditable = (links: ProfileLink[]) =>
    links.map((l) => ({ platform: l.platform, url: urlToIdentifier(l.platform, l.url), label: l.label }));
  let profileLinks = $state<ProfileLink[]>(toEditable(data.user.links ?? []));
  const initialLinks = JSON.stringify(toEditable(data.user.links ?? []));
  let nameEl = $state<HTMLInputElement | null>(null);
  let bioEl = $state<HTMLTextAreaElement | null>(null);

  const insertNameEmoji = (emoji: string) =>
    insertEmojiIntoField(nameEl, displayName, 60, emoji, (v) => (displayName = v));
  const insertBioEmoji = (emoji: string) =>
    insertEmojiIntoField(bioEl, bio, 500, emoji, (v) => (bio = v));
  let file = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  let error = $state("");
  let saved = $state(false);
  let busy = $state(false);

  const MAX_BYTES = 2 * 1024 * 1024;

  const themeOptions: { value: ThemePreference; label: string; icon: IconName }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "monitor" },
  ];

  const feedOptions: { value: FeedTab; label: string; icon: IconName }[] = [
    { value: "for-you", label: "For you", icon: "sparkles" },
    { value: "local", label: "Local", icon: "users" },
    { value: "global", label: "Global", icon: "globe" },
  ];

  // Default to "For you" when no explicit choice has been saved yet.
  const currentFeed = $derived(reading.defaultFeed ?? "for-you");

  const dirty = $derived(
    displayName !== data.user.displayName ||
      bio !== data.user.bio ||
      publicEmail !== data.user.publicEmail ||
      file !== null ||
      profileTags.join(",") !== initialTags ||
      JSON.stringify(profileLinks) !== initialLinks,
  );

  let removingPhoto = $state(false);

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = null;
    previewUrl = null;
  }

  // Discards a freshly-picked (unsaved) photo, or removes the saved avatar so the
  // profile reverts to initials.
  async function removePhoto() {
    error = "";
    if (file) {
      clearFile();
      return;
    }
    if (!data.user.avatarUrl) return;
    removingPhoto = true;
    try {
      await endpoints().removeAvatar();
      await invalidateAll();
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to remove photo.";
    } finally {
      removingPhoto = false;
    }
  }

  function onFileChange(e: Event) {
    const picked = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      error = "Please choose an image file.";
      return;
    }
    if (picked.size > MAX_BYTES) {
      error = "Image too large (max 2 MB).";
      return;
    }
    error = "";
    clearFile();
    file = picked;
    previewUrl = URL.createObjectURL(picked);
  }

  async function save() {
    error = "";
    saved = false;
    busy = true;
    try {
      if (file) {
        // Downscale/re-encode to ~256px before upload so avatars aren't shipped
        // at full photo resolution.
        const { blob, type } = await prepareImage(file, AVATAR_MAX_DIMENSION);
        await endpoints().uploadAvatar(blob, type);
      }
      // Convert each typed identifier to a canonical URL, skipping blank rows.
      const links = [];
      for (const l of profileLinks) {
        if (!l.url.trim()) continue;
        const url = identifierToUrl(l.platform, l.url);
        if (!url) {
          const meta = platformMeta(l.platform);
          const what = meta.input.kind === "fedi"
            ? "handle (@user@instance)"
            : meta.input.kind === "matrix"
            ? "id (@user:server)"
            : meta.input.kind === "xmpp"
            ? "address (user@server)"
            : meta.input.kind === "irc"
            ? "address (ircs://host/#channel)"
            : meta.input.kind === "handle"
            ? "username"
            : "web address";
          error = `Enter a valid ${meta.label} ${what}.`;
          busy = false;
          return;
        }
        links.push({ platform: l.platform, url, label: l.label.trim() });
      }
      await endpoints().updateProfile({ displayName, bio, publicEmail, tags: profileTags, links });
      await invalidateAll();
      clearFile();
      saved = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to save changes.";
    } finally {
      busy = false;
    }
  }

  async function logout() {
    await endpoints().logout();
    await invalidateAll();
    goto("/");
  }

  // Resend email verification for an unverified account.
  let resending = $state(false);
  let resendDone = $state(false);
  async function resendVerification() {
    if (!data.user.email) return;
    resending = true;
    try {
      await endpoints().resendVerification(data.user.email);
      resendDone = true;
    } catch {
      // No-op surface: the endpoint never reveals account state; nothing to show.
    } finally {
      resending = false;
    }
  }

  // Change password — dialog requiring the current password plus a new one.
  let pwOpen = $state(false);
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let pwError = $state("");
  let pwBusy = $state(false);
  let pwSaved = $state(false);

  function onPwOpenChange(next: boolean) {
    pwOpen = next;
    if (next) {
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
      pwError = "";
      pwSaved = false;
    }
  }

  async function changePassword() {
    pwError = "";
    if (newPassword.length < 8) {
      pwError = "New password must be at least 8 characters.";
      return;
    }
    if (newPassword !== confirmPassword) {
      pwError = "New passwords don't match.";
      return;
    }
    pwBusy = true;
    try {
      await endpoints().changePassword(currentPassword, newPassword);
      pwSaved = true;
      pwOpen = false;
    } catch (err) {
      pwError = err instanceof ApiError ? err.message : "Failed to change password.";
    } finally {
      pwBusy = false;
    }
  }

  // Account deletion — guarded by a dialog that requires the current password.
  let deleteOpen = $state(false);
  let deletePassword = $state("");
  let deleteError = $state("");
  let deleting = $state(false);

  function onDeleteOpenChange(next: boolean) {
    deleteOpen = next;
    if (next) {
      deletePassword = "";
      deleteError = "";
    }
  }

  async function deleteAccount() {
    deleteError = "";
    deleting = true;
    try {
      await endpoints().deleteAccount(deletePassword);
      await invalidateAll();
      goto("/");
    } catch (err) {
      deleteError = err instanceof ApiError ? err.message : "Failed to delete account.";
      deleting = false;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
</script>

<svelte:head><title>Settings · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="settings" size={22} /> Settings
  </h1>
  <p class="mt-1 text-muted-foreground">Manage your profile, appearance, and account.</p>
</header>

<div class="flex flex-col gap-8">
  <!-- Profile -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Profile</h2>
    <p class="mt-1 text-sm text-muted-foreground">Update how you appear across the fediverse.</p>

    <div class="mt-6 flex flex-col gap-5">
      <!-- Avatar -->
      <div class="flex items-center gap-4">
        <button
          type="button"
          onclick={() => fileInput?.click()}
          class="group relative rounded-full"
          aria-label="Change profile picture"
        >
          <Avatar
            name={displayName || data.user.displayName}
            src={previewUrl ?? data.user.avatarUrl ?? undefined}
            size={72}
          />
          <span
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Icon name="camera" size={20} />
          </span>
        </button>
        <div class="flex flex-col gap-1.5">
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onclick={() => fileInput?.click()}>
              <Icon name="camera" size={15} /> Change photo
            </Button>
            {#if file || data.user.avatarUrl}
              <Button
                variant="ghost"
                size="sm"
                onclick={removePhoto}
                disabled={removingPhoto}
                class="text-muted-foreground hover:text-destructive"
              >
                <Icon name="trash" size={15} /> {removingPhoto ? "Removing…" : "Remove"}
              </Button>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF · max 2 MB</p>
        </div>
        <input
          bind:this={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="hidden"
          onchange={onFileChange}
        />
      </div>

      <!-- Display name -->
      <div class="flex flex-col gap-1.5">
        <Label.Root for="displayName" class={labelClass}>Display name</Label.Root>
        <div class="relative">
          <input
            id="displayName"
            bind:this={nameEl}
            bind:value={displayName}
            maxlength={60}
            class={`${field} w-full pr-11`}
          />
          <EmojiTrigger
            onPick={insertNameEmoji}
            align="end"
            class={`${emojiOverlayBtn} right-1.5 top-1/2 -translate-y-1/2`}
          />
        </div>
      </div>

      <!-- Bio -->
      <div class="flex flex-col gap-1.5">
        <Label.Root for="bio" class={labelClass}>Bio</Label.Root>
        <div class="relative">
          <textarea
            id="bio"
            bind:this={bioEl}
            bind:value={bio}
            rows={3}
            maxlength={500}
            placeholder="Tell people about yourself"
            class={`${field} w-full resize-none pr-11`}
          ></textarea>
          <EmojiTrigger
            onPick={insertBioEmoji}
            align="end"
            class={`${emojiOverlayBtn} bottom-2 right-1.5`}
          />
        </div>
        <p class="self-end text-xs text-muted-foreground">{bio.length}/500</p>
      </div>

      <!-- Public email -->
      <div class="flex flex-col gap-1.5">
        <Label.Root for="publicEmail" class={labelClass}>Public email</Label.Root>
        <input
          id="publicEmail"
          type="email"
          bind:value={publicEmail}
          maxlength={254}
          placeholder="you@example.com"
          autocomplete="off"
          class={`${field} w-full`}
        />
        <p class="text-xs text-muted-foreground">
          Optional — shown on your profile for anyone to contact you. Leave blank to hide it.
        </p>
      </div>

      <!-- Profile tags -->
      <div class="flex flex-col gap-1.5">
        <Label.Root class={labelClass}>Tags</Label.Root>
        <TagInput
          bind:tags={profileTags}
          max={MAX_PROFILE_TAGS}
          hint="Topics you post about — shown on your profile and federated to other servers."
        />
      </div>

      <!-- Profile links -->
      <div class="flex flex-col gap-1.5">
        <Label.Root class={labelClass}>Links</Label.Root>
        <ProfileLinksEditor bind:links={profileLinks} />
      </div>

      {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

      <div class="flex items-center justify-end gap-3">
        {#if saved && !dirty}<p class="text-sm text-muted-foreground">Saved.</p>{/if}
        <Button variant="solid" disabled={busy || !dirty} onclick={save}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  </section>

  <!-- Appearance -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Appearance</h2>
    <p class="mt-1 text-sm text-muted-foreground">Choose how Omicron looks to you.</p>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p class="text-sm font-medium text-foreground">Theme</p>
        <p class="text-xs text-muted-foreground">
          Use a fixed theme, or follow your system setting.
        </p>
      </div>
      <div
        class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-auto"
      >
        {#each themeOptions as opt (opt.value)}
          <ButtonPrimitive.Root
            onclick={() => theme.set(opt.value)}
            aria-pressed={theme.preference === opt.value}
            class={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-button px-3 text-sm font-medium active:scale-[0.98] ${
              theme.preference === opt.value
                ? "bg-background text-foreground shadow-mini"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name={opt.icon} size={15} /> {opt.label}
          </ButtonPrimitive.Root>
        {/each}
      </div>
    </div>
  </section>

  <!-- Reading -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Reading</h2>
    <p class="mt-1 text-sm text-muted-foreground">Customize your reading experience.</p>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p class="text-sm font-medium text-foreground">Default feed</p>
        <p class="text-xs text-muted-foreground">Which tab opens first on the home page.</p>
      </div>
      <div
        class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-auto"
      >
        {#each feedOptions as opt (opt.value)}
          <ButtonPrimitive.Root
            onclick={() => reading.setDefaultFeed(opt.value)}
            aria-pressed={currentFeed === opt.value}
            class={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-button px-3 text-sm font-medium active:scale-[0.98] ${
              currentFeed === opt.value
                ? "bg-background text-foreground shadow-mini"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name={opt.icon} size={15} /> {opt.label}
          </ButtonPrimitive.Root>
        {/each}
      </div>
    </div>
  </section>

  <!-- Followed tags -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Followed tags</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Stories tagged with these show up in your “For you” feed. Open any tag to follow it.
    </p>

    <div class="mt-4">
      <FollowedTagsManager />
    </div>
  </section>

  <!-- Connections -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Muted &amp; blocked</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Accounts you've muted or blocked. Manage who you follow from your profile.
    </p>

    <div class="mt-4">
      <ConnectionsManager />
    </div>
  </section>

  {#if data.user.isAdmin}
    <!-- Instance moderation (admins only). -->
    <section class="rounded-card border border-border bg-background p-6">
      <h2 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <Icon name="admin" size={18} /> Instance moderation
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Settings that apply to everyone on this instance.
      </p>

      <div class="mt-5">
        <InstanceModeration />
      </div>
    </section>
  {/if}

  <!-- Account -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Account</h2>

    <dl class="mt-4 flex flex-col gap-3 text-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <dt class="text-muted-foreground">Username</dt>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Your fediverse handle — permanent and can't be changed.
          </p>
        </div>
        <dd class="font-medium text-foreground">@{data.user.username}</dd>
      </div>
      {#if data.user.email}
        <div class="flex items-start justify-between gap-4">
          <div>
            <dt class="text-muted-foreground">Email</dt>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Your private login address — used for sign-in and account recovery.
            </p>
          </div>
          <dd class="flex flex-col items-end gap-1">
            <span class="font-medium text-foreground">{data.user.email}</span>
            {#if data.user.emailVerified}
              <span class="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Icon name="check" size={13} /> Verified
              </span>
            {:else if resendDone}
              <span class="text-xs text-muted-foreground">Verification link sent.</span>
            {:else}
              <span class="inline-flex items-center gap-2 text-xs">
                <span class="text-muted-foreground">Unverified</span>
                <ButtonPrimitive.Root
                  onclick={resendVerification}
                  disabled={resending}
                  class="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground disabled:opacity-60"
                >
                  {resending ? "Sending…" : "Resend link"}
                </ButtonPrimitive.Root>
              </span>
            {/if}
          </dd>
        </div>
      {/if}
      <div class="flex items-start justify-between gap-4">
        <div>
          <dt class="text-muted-foreground">Password</dt>
          {#if pwSaved}<p class="mt-0.5 text-xs text-muted-foreground">Password updated.</p>{/if}
        </div>
        <dd>
          <Button variant="outline" size="sm" onclick={() => onPwOpenChange(true)}>
            <Icon name="lock" size={15} /> Change password
          </Button>
        </dd>
      </div>
      <div class="flex items-center justify-between gap-4">
        <dt class="text-muted-foreground">Joined</dt>
        <dd class="font-medium text-foreground">{formatDate(data.user.createdAt)}</dd>
      </div>
    </dl>

    <div class="mt-6 flex justify-end">
      <Button variant="outline" size="sm" onclick={logout}>
        <Icon name="logout" size={15} /> Sign out
      </Button>
    </div>
  </section>

  <!-- Danger zone -->
  <section class="rounded-card border border-destructive/40 bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-destructive">Delete account</h2>
    <p class="mt-1 max-w-prose text-sm text-muted-foreground">
      Permanently delete your account, posts, and follows. If your instance is federated, other
      servers are told to remove your profile too. This cannot be undone.
    </p>

    <div class="mt-4 flex justify-end">
      <Button variant="destructive" size="sm" onclick={() => onDeleteOpenChange(true)}>
        <Icon name="trash" size={15} /> Delete account
      </Button>
    </div>
  </section>
</div>

<Dialog.Root bind:open={pwOpen} onOpenChange={onPwOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[440px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Change password
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        Enter your current password, then choose a new one.
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="current-password" class={labelClass}>Current password</Label.Root>
          <input
            id="current-password"
            type="password"
            bind:value={currentPassword}
            autocomplete="current-password"
            class={field}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="new-password" class={labelClass}>New password</Label.Root>
          <input
            id="new-password"
            type="password"
            bind:value={newPassword}
            autocomplete="new-password"
            placeholder="min 8 characters"
            class={field}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="confirm-password" class={labelClass}>Confirm new password</Label.Root>
          <input
            id="confirm-password"
            type="password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            class={field}
          />
        </div>
        {#if pwError}<p class="text-destructive text-sm">{pwError}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button
          variant="solid"
          disabled={pwBusy || !currentPassword || !newPassword}
          onclick={changePassword}
        >
          {pwBusy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen} onOpenChange={onDeleteOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[440px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Delete account
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        This permanently deletes <strong class="text-foreground">@{data.user.username}</strong> and
        everything in it. Enter your password to confirm.
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-1.5">
        <Label.Root for="delete-password" class={labelClass}>Password</Label.Root>
        <input
          id="delete-password"
          type="password"
          bind:value={deletePassword}
          autocomplete="current-password"
          class={field}
        />
        {#if deleteError}<p class="text-destructive text-sm">{deleteError}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button
          variant="destructive"
          disabled={deleting || deletePassword.length === 0}
          onclick={deleteAccount}
        >
          {deleting ? "Deleting…" : "Delete forever"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
