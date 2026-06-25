<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import { theme } from "$lib/theme.svelte";
  import { formatDate } from "$lib/format";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Profile form — seeded from the loaded user.
  let displayName = $state(data.user.displayName);
  let bio = $state(data.user.bio);
  let file = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  let error = $state("");
  let saved = $state(false);
  let busy = $state(false);

  const MAX_BYTES = 2 * 1024 * 1024;

  const dirty = $derived(
    displayName !== data.user.displayName || bio !== data.user.bio || file !== null,
  );

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = null;
    previewUrl = null;
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
      if (file) await endpoints().uploadAvatar(file);
      await endpoints().updateProfile({ displayName, bio });
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
          <Button variant="outline" size="sm" onclick={() => fileInput?.click()}>
            <Icon name="camera" size={15} /> Change photo
          </Button>
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
        <input id="displayName" bind:value={displayName} maxlength={60} class={field} />
      </div>

      <!-- Bio -->
      <div class="flex flex-col gap-1.5">
        <Label.Root for="bio" class={labelClass}>Bio</Label.Root>
        <textarea
          id="bio"
          bind:value={bio}
          rows={3}
          maxlength={500}
          placeholder="Tell people about yourself"
          class={`${field} resize-none`}
        ></textarea>
        <p class="self-end text-xs text-muted-foreground">{bio.length}/500</p>
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

    <div class="mt-4 flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-foreground">Theme</p>
        <p class="text-xs text-muted-foreground">Switch between light and dark mode.</p>
      </div>
      <Button variant="outline" size="sm" onclick={() => theme.toggle()}>
        <Icon name={theme.current === "dark" ? "sun" : "moon"} size={15} />
        {theme.current === "dark" ? "Light mode" : "Dark mode"}
      </Button>
    </div>
  </section>

  <!-- Account -->
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Account</h2>

    <dl class="mt-4 flex flex-col gap-3 text-sm">
      <div class="flex items-center justify-between gap-4">
        <dt class="text-muted-foreground">Username</dt>
        <dd class="font-medium text-foreground">@{data.user.username}</dd>
      </div>
      <div class="flex items-center justify-between gap-4">
        <dt class="text-muted-foreground">Joined</dt>
        <dd class="font-medium text-foreground">{formatDate(data.user.createdAt)}</dd>
      </div>
    </dl>

    <div class="mt-6 flex justify-end">
      <Button variant="outline" size="sm" onclick={logout} class="text-destructive">
        <Icon name="logout" size={15} /> Sign out
      </Button>
    </div>
  </section>
</div>
