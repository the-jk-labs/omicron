<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, refreshAll } from "$app/navigation";
  import { page } from "$app/state";
  import { Button as ButtonPrimitive, Dialog, Label, Switch, Tabs } from "bits-ui";
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import { authClient } from "#lib/auth-client.js";
  import AvatarCropper from "#lib/components/AvatarCropper.svelte";
  import ChangeEmailDialog from "#lib/components/ChangeEmailDialog.svelte";
  import ConnectionsManager from "#lib/components/ConnectionsManager.svelte";
  import CustomSectionEditor from "#lib/components/CustomSectionEditor.svelte";
  import EmojiTrigger from "#lib/components/EmojiTrigger.svelte";
  import FeedLanguageFilter from "#lib/components/FeedLanguageFilter.svelte";
  import FollowedTagsManager from "#lib/components/FollowedTagsManager.svelte";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import PasskeysManager from "#lib/components/PasskeysManager.svelte";
  import ProfileLinksEditor from "#lib/components/ProfileLinksEditor.svelte";
  import SessionsManager from "#lib/components/SessionsManager.svelte";
  import TagInput from "#lib/components/TagInput.svelte";
  import Time from "#lib/components/Time.svelte";
  import Avatar from "#lib/components/ui/Avatar.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import PageTabs from "#lib/components/ui/PageTabs.svelte";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import WebhookTokensManager from "#lib/components/WebhookTokensManager.svelte";
  import { AVATAR_MAX_DIMENSION, prepareImage } from "#lib/editor/image.js";
  import { insertEmojiIntoField, emojiOverlayBtn } from "#lib/emoji.js";
  import { MIN_PASSWORD_LEN, isPwnedPasswordClient } from "#lib/password.js";
  import { notALoginField } from "#lib/passwordManagers.js";
  import { reading, type FeedTab } from "#lib/prefs.svelte.js";
  import { identifierToUrl, platformMeta, urlToIdentifier } from "#lib/profileLinks.js";
  import { MAX_PROFILE_TAGS } from "#lib/tags.js";
  import { theme, type ThemePreference } from "#lib/theme.svelte.js";
  import type { ProfileLink } from "#lib/types.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const TABS = [
    { value: "profile", label: "Profile", icon: "user" },
    { value: "preferences", label: "Preferences", icon: "sliders" },
    { value: "privacy", label: "Privacy", icon: "eye" },
    { value: "account", label: "Account", icon: "lock" },
    { value: "integrations", label: "Integrations", icon: "plug" },
  ] as const satisfies readonly { value: string; label: string; icon: IconName }[];
  type Tab = (typeof TABS)[number]["value"];

  // The open tab lives in ?tab= so it renders on the server, survives a reload
  // and can be linked to (the passkey emails open ?tab=account#passkeys).
  const asTab = (v: string | null): Tab => TABS.find((t) => t.value === v)?.value ?? "profile";
  let tab = $state<Tab>(asTab(untrack(() => page.url.searchParams.get("tab"))));

  function selectTab(value: string) {
    tab = asTab(value);
    void goto(`?tab=${tab}`, { shallow: true, replace: true });
  }

  // Profile form — seeded once from the loaded user; edits live in the form and
  // are persisted on save, so we intentionally capture the initial value only.
  const seed = untrack(() => data.user);
  let displayName = $state(seed.displayName);
  let bio = $state(seed.bio);
  let publicEmail = $state(seed.publicEmail);
  let customSection = $state(seed.customSection ?? "");
  // Mirrors the backend's cap (services/users.ts) — the two apps don't share a
  // constants module, so this is kept in sync by hand.
  const MAX_CUSTOM_SECTION_LEN = 20_000;
  let profileTags = $state<string[]>(seed.tags?.map((t) => t.name) ?? []);
  // Baselines follow the saved profile (refreshed by refreshAll), like the text fields.
  const initialTags = $derived((data.user.tags?.map((t) => t.name) ?? []).join(","));
  // The editor works in "identifier" form (a handle / username), so seed from
  // the stored canonical URLs and convert back on save. Deep-copied so edits
  // don't mutate the loaded page data.
  const toEditable = (links: ProfileLink[]) =>
    links.map((l) => ({ platform: l.platform, url: urlToIdentifier(l.platform, l.url), label: l.label }));
  let profileLinks = $state<ProfileLink[]>(toEditable(seed.links ?? []));
  // Links are compared as save() sends them (canonical URL, blank rows skipped), so
  // "ada.example" matches a stored "https://ada.example/" once it has been saved.
  const canonicalLinks = (links: ProfileLink[]) =>
    JSON.stringify(
      links
        .filter((l) => l.url.trim())
        .map((l) => ({
          platform: l.platform,
          url: identifierToUrl(l.platform, l.url) ?? l.url,
          label: l.label.trim(),
        })),
    );
  const initialLinks = $derived(canonicalLinks(toEditable(data.user.links ?? [])));
  let nameEl = $state<HTMLInputElement | null>(null);
  let bioEl = $state<HTMLTextAreaElement | null>(null);

  const insertNameEmoji = (emoji: string) =>
    insertEmojiIntoField(nameEl, displayName, 60, emoji, (v) => (displayName = v));
  const insertBioEmoji = (emoji: string) => insertEmojiIntoField(bioEl, bio, 500, emoji, (v) => (bio = v));
  let fileInput = $state<HTMLInputElement | null>(null);
  // The freshly-picked raw photo, shown in the crop dialog until it is saved.
  let cropSrc = $state<string | null>(null);
  let cropOpen = $state(false);

  let error = $state("");
  let saved = $state(false);
  let busy = $state(false);

  // Backend's hard cap (services/users.ts) — kept in sync manually, since the
  // two apps don't share a constants module.
  const MAX_BYTES = 2 * 1024 * 1024;
  // Sanity cap on the *raw* pick, well above MAX_BYTES: photos this size get
  // auto-compressed on save, so we only need to guard against decoding
  // something absurd (e.g. a multi-hundred-MB raw scan) in the browser.
  const MAX_RAW_BYTES = 25 * 1024 * 1024;

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

  // The server's copy of the saved choice renders the switch before hydration.
  const currentFeed = $derived(reading.defaultFeed ?? data.defaultFeed ?? "for-you");

  const dirty = $derived(
    displayName !== data.user.displayName ||
      bio !== data.user.bio ||
      publicEmail !== data.user.publicEmail ||
      customSection !== (data.user.customSection ?? "") ||
      profileTags.join(",") !== initialTags ||
      canonicalLinks(profileLinks) !== initialLinks,
  );

  let removingPhoto = $state(false);

  function clearCropSrc() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    cropSrc = null;
  }

  // Uploads the cropped photo straight away: Save in the crop dialog is where
  // people expect it to be set, not the profile form's Save changes. A thrown
  // error keeps the dialog open and shows there.
  async function onCropped(cropped: File) {
    // Downscale/re-encode to ~160px so avatars aren't shipped at full size.
    const { blob, type } = await prepareImage(cropped, AVATAR_MAX_DIMENSION, MAX_BYTES);
    if (blob.size > MAX_BYTES) {
      throw new Error("Image too large (max 2 MB) even after compression. Please choose a different photo.");
    }
    try {
      await endpoints().uploadAvatar(blob, type);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to upload photo.", { cause: err });
    }
    await refreshAll();
  }

  // Discard the raw pick once the crop dialog closes.
  $effect(() => {
    if (!cropOpen && cropSrc) clearCropSrc();
  });

  // Removes the saved avatar so the profile reverts to initials.
  async function removePhoto() {
    error = "";
    if (!data.user.avatarUrl) return;
    removingPhoto = true;
    try {
      await endpoints().removeAvatar();
      await refreshAll();
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
    if (picked.size > MAX_RAW_BYTES) {
      error = "Image too large. Please choose a file under 25 MB.";
      return;
    }
    error = "";
    // Open the crop/zoom dialog on the raw pick; onCropped stages the result.
    clearCropSrc();
    cropSrc = URL.createObjectURL(picked);
    cropOpen = true;
    // Reset the input so re-picking the same file fires change again.
    (e.target as HTMLInputElement).value = "";
  }

  async function save() {
    error = "";
    saved = false;
    busy = true;
    try {
      // Convert each typed identifier to a canonical URL, skipping blank rows.
      const links = [];
      for (const l of profileLinks) {
        if (!l.url.trim()) continue;
        const url = identifierToUrl(l.platform, l.url);
        if (!url) {
          const meta = platformMeta(l.platform);
          const what =
            meta.input.kind === "fedi"
              ? "handle (@user@instance)"
              : meta.input.kind === "matrix"
                ? "id (@user:server)"
                : meta.input.kind === "xmpp"
                  ? "address (user@server)"
                  : meta.input.kind === "irc"
                    ? "address (ircs://host/#channel)"
                    : meta.input.kind === "linkedin"
                      ? "profile (in/username or company/name)"
                      : meta.input.kind === "handle"
                        ? "username"
                        : "web address";
          error = `Enter a valid ${meta.label} ${what}.`;
          busy = false;
          return;
        }
        links.push({ platform: l.platform, url, label: l.label.trim() });
      }
      await endpoints().updateProfile({
        displayName,
        bio,
        publicEmail,
        customSection,
        tags: profileTags,
        links,
      });
      await refreshAll();
      saved = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to save changes.";
    } finally {
      busy = false;
    }
  }

  async function logout() {
    await authClient.signOut();
    // Reload data on the way home, not in place: on a protected page that would
    // rerun its guard and bounce through /login first.
    await goto("/", { refreshAll: true });
  }

  // Private account toggle. Optimistic: flip the switch immediately, revert on
  // error. Going public server-side auto-approves any pending follow requests.
  let isPrivate = $state(untrack(() => data.user.isPrivate));
  let privacyBusy = $state(false);
  async function togglePrivacy(next: boolean) {
    privacyBusy = true;
    isPrivate = next;
    try {
      await endpoints().setPrivacy(next);
      await refreshAll();
    } catch {
      isPrivate = !next;
    } finally {
      privacyBusy = false;
    }
  }

  // Resend email verification for an unverified account.
  let resending = $state(false);
  let resendDone = $state(false);
  async function resendVerification() {
    if (!data.user.email) return;
    resending = true;
    try {
      await authClient.sendVerificationEmail({ email: data.user.email, callbackURL: "/verify-email" });
      resendDone = true;
    } catch {
      // No-op surface: the endpoint never reveals account state; nothing to show.
    } finally {
      resending = false;
    }
  }

  // Change password — dialog requiring the current password plus a new one.
  let pwOpen = $state(false);
  let emailOpen = $state(false);
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
    if (newPassword.length < MIN_PASSWORD_LEN) {
      pwError = `New password must be at least ${MIN_PASSWORD_LEN} characters.`;
      return;
    }
    if (newPassword !== confirmPassword) {
      pwError = "New passwords don't match.";
      return;
    }
    if (await isPwnedPasswordClient(newPassword)) {
      pwError = "This password has appeared in a data breach. Please choose a different one.";
      return;
    }
    pwBusy = true;
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (res.error) {
        pwError = res.error.message ?? "Failed to change password.";
        return;
      }
      pwSaved = true;
      pwOpen = false;
    } catch (err) {
      pwError = err instanceof Error ? err.message : "Failed to change password.";
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
      const res = await authClient.deleteUser({ password: deletePassword });
      if (res.error) {
        deleteError = res.error.message ?? "Failed to delete account.";
        deleting = false;
        return;
      }
      await goto("/", { refreshAll: true });
    } catch (err) {
      deleteError = err instanceof Error ? err.message : "Failed to delete account.";
      deleting = false;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
</script>

<PageTitle text="Settings" />

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="settings" size={22} /> Settings
  </h1>
</header>

<Tabs.Root value={tab} onValueChange={selectTab}>
  <PageTabs tabs={TABS} />

  <Tabs.Content value="profile" class="mt-6">
    <div class="flex flex-col gap-8">
      <!-- Profile -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Profile</h2>
        <p class="mt-1 text-sm text-muted-foreground">How you appear across the fediverse.</p>

        <div class="mt-6 flex flex-col gap-5">
          <!-- Avatar -->
          <div class="flex items-center gap-4">
            <button
              type="button"
              onclick={() => fileInput?.click()}
              class="group relative rounded-full"
              aria-label="Change profile picture"
            >
              <Avatar name={displayName || data.user.displayName} src={data.user.avatarUrl ?? undefined} size={72} />
              <span
                class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="camera" size={20} />
              </span>
            </button>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onclick={() => fileInput?.click()}>
                <Icon name="camera" size={15} /> Change photo
              </Button>
              {#if data.user.avatarUrl}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={removePhoto}
                  disabled={removingPhoto}
                  class="text-muted-foreground hover:text-destructive"
                >
                  <Icon name="trash" size={15} />
                  {removingPhoto ? "Removing…" : "Remove"}
                </Button>
              {/if}
            </div>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="hidden"
              onchange={onFileChange}
            />
            <AvatarCropper bind:open={cropOpen} src={cropSrc} onCrop={onCropped} />
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
                class={`${emojiOverlayBtn} top-1/2 right-1.5 -translate-y-1/2`}
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
                class={`${field} w-full resize-none pr-11`}></textarea>
              <EmojiTrigger onPick={insertBioEmoji} align="end" class={`${emojiOverlayBtn} right-1.5 bottom-2`} />
            </div>
            <p class="self-end text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          <!-- Public email -->
          <div class="flex flex-col gap-1.5">
            <Label.Root for="publicEmail" class={labelClass}
              >Public email <span class="font-normal text-muted-foreground">· optional</span></Label.Root
            >
            <input
              id="publicEmail"
              type="email"
              bind:value={publicEmail}
              maxlength={254}
              placeholder="you@example.com"
              autocomplete="off"
              {...notALoginField}
              class={`${field} w-full`}
            />
          </div>

          <!-- Profile tags -->
          <div class="flex flex-col gap-1.5">
            <Label.Root class={labelClass}>Tags</Label.Root>
            <TagInput bind:tags={profileTags} max={MAX_PROFILE_TAGS} hint="Topics you write about." />
          </div>

          <!-- Profile links -->
          <div class="flex flex-col gap-1.5">
            <Label.Root class={labelClass}>Links</Label.Root>
            <ProfileLinksEditor bind:links={profileLinks} />
          </div>

          <!-- Custom section -->
          <div class="flex flex-col gap-1.5">
            <Label.Root class={labelClass}
              >Custom section <span class="font-normal text-muted-foreground">· optional</span></Label.Root
            >
            <p class="text-xs text-muted-foreground">Shown at the top of your About tab. Markdown works.</p>
            <div class="mt-1">
              <CustomSectionEditor bind:value={customSection} maxLength={MAX_CUSTOM_SECTION_LEN} />
            </div>
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
    </div>
  </Tabs.Content>

  <Tabs.Content value="preferences" class="mt-6">
    <div class="flex flex-col gap-8">
      <!-- Appearance -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Appearance</h2>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p class="text-sm font-medium text-foreground">Theme</p>
          <div
            class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-auto"
          >
            {#each themeOptions as opt (opt.value)}
              <ButtonPrimitive.Root
                onclick={() => theme.set(opt.value)}
                aria-pressed={theme.preference === opt.value}
                data-theme-option={opt.value}
                class="inline-flex h-8 items-center gap-1.5 rounded-button px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground active:scale-[0.98]"
              >
                <Icon name={opt.icon} size={15} />
                {opt.label}
              </ButtonPrimitive.Root>
            {/each}
          </div>
        </div>
      </section>

      <!-- Reading -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Reading</h2>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p class="text-sm font-medium text-foreground">Default feed</p>
          <div
            class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-auto"
          >
            {#each feedOptions as opt (opt.value)}
              <ButtonPrimitive.Root
                onclick={() => reading.setDefaultFeed(opt.value)}
                aria-pressed={currentFeed === opt.value}
                class={`inline-flex h-8 items-center gap-1.5 rounded-button px-3 text-sm font-medium whitespace-nowrap active:scale-[0.98] ${
                  currentFeed === opt.value
                    ? "bg-background text-foreground shadow-mini"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon name={opt.icon} size={15} />
                {opt.label}
              </ButtonPrimitive.Root>
            {/each}
          </div>
        </div>

        <FeedLanguageFilter />
      </section>

      <!-- Followed tags -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Followed tags</h2>
        <p class="mt-1 text-sm text-muted-foreground">Their articles show up in your “For you” feed.</p>

        <div class="mt-4">
          <FollowedTagsManager initial={data.followedTags} />
        </div>
      </section>
    </div>
  </Tabs.Content>

  <Tabs.Content value="privacy" class="mt-6">
    <div class="flex flex-col gap-8">
      <!-- Visibility -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Visibility</h2>

        <div class="mt-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <Label.Root for="private-account" class="text-sm font-medium text-foreground">Private account</Label.Root>
            <p class="mt-0.5 text-xs text-muted-foreground">Only followers you approve can read your articles.</p>
          </div>
          <Switch.Root
            id="private-account"
            checked={isPrivate}
            onCheckedChange={togglePrivacy}
            disabled={privacyBusy}
            class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
          >
            <Switch.Thumb
              class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
            />
          </Switch.Root>
        </div>
      </section>

      <!-- Connections -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Muted &amp; blocked</h2>

        <div class="mt-4">
          <ConnectionsManager initial={{ muted: data.muted, blocked: data.blocked }} />
        </div>
      </section>
    </div>
  </Tabs.Content>

  <Tabs.Content value="account" class="mt-6">
    <div class="flex flex-col gap-8">
      <!-- Sign-in details -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Sign-in details</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Member since <Time iso={data.user.createdAt} kind="date" />.
        </p>

        <!-- One row per detail: what it is and its value on the left, the action on the right. -->
        <dl class="mt-4 divide-y divide-border text-sm">
          <div class="flex items-center justify-between gap-4 py-4 first:pt-0">
            <div class="min-w-0">
              <dt class="font-medium text-foreground">Username</dt>
              <dd class="mt-0.5 text-muted-foreground">
                <span class="text-foreground">@{data.user.username}</span> · your fediverse address, permanent
              </dd>
            </div>
          </div>

          {#if data.user.email}
            <div class="flex items-center justify-between gap-4 py-4">
              <div class="min-w-0">
                <dt class="font-medium text-foreground">Email</dt>
                <dd class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <span class="min-w-0 truncate text-foreground" title={data.user.email}>{data.user.email}</span>
                  {#if data.user.emailVerified}
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      <Icon name="check" size={12} /> Verified
                    </span>
                  {:else}
                    <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-destructive"
                      >Unverified</span
                    >
                    {#if resendDone}
                      <span class="text-xs">Verification link sent.</span>
                    {:else}
                      <ButtonPrimitive.Root
                        onclick={resendVerification}
                        disabled={resending}
                        class="text-xs font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground disabled:opacity-60"
                      >
                        {resending ? "Sending…" : "Resend link"}
                      </ButtonPrimitive.Root>
                    {/if}
                  {/if}
                </dd>
              </div>
              <Button variant="outline" size="sm" class="shrink-0" onclick={() => (emailOpen = true)}>
                <Icon name="mail" size={15} /> Change email
              </Button>
            </div>
          {/if}

          <div class="flex items-center justify-between gap-4 py-4">
            <div class="min-w-0">
              <dt class="font-medium text-foreground">Password</dt>
              <dd class="mt-0.5 text-muted-foreground">{pwSaved ? "Password updated." : "••••••••••"}</dd>
            </div>
            <Button variant="outline" size="sm" class="shrink-0" onclick={() => onPwOpenChange(true)}>
              <Icon name="lock" size={15} /> Change password
            </Button>
          </div>
        </dl>

        <div class="mt-2 flex justify-end border-t border-border pt-4">
          <Button variant="outline" size="sm" onclick={logout}>
            <Icon name="logout" size={15} /> Sign out
          </Button>
        </div>
      </section>

      <!-- Passkeys -->
      <section id="passkeys" class="rounded-card border border-border bg-background p-6">
        <PasskeysManager username={data.user.username} initial={data.passkeys}>
          {#snippet header()}
            <h2 class="text-lg font-semibold tracking-tight text-foreground">Passkeys</h2>
            <p class="mt-1 max-w-prose text-sm text-muted-foreground">
              Sign in with your fingerprint, face, or screen lock.
            </p>
          {/snippet}
        </PasskeysManager>
      </section>

      <!-- Active sessions -->
      <section id="sessions" class="rounded-card border border-border bg-background p-6">
        <SessionsManager username={data.user.username} initial={data.sessions}>
          {#snippet header()}
            <h2 class="text-lg font-semibold tracking-tight text-foreground">Active sessions</h2>
            <p class="mt-1 max-w-prose text-sm text-muted-foreground">
              Don't recognize a device? Sign it out, then change your password.
            </p>
          {/snippet}
        </SessionsManager>
      </section>

      <!-- Danger zone -->
      <section class="rounded-card border border-destructive/40 bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-destructive">Delete account</h2>
        <p class="mt-1 max-w-prose text-sm text-muted-foreground">
          Permanently deletes your account, articles, and follows. This can't be undone.
        </p>

        <div class="mt-4 flex justify-end">
          <Button variant="destructive" size="sm" onclick={() => onDeleteOpenChange(true)}>
            <Icon name="trash" size={15} /> Delete account
          </Button>
        </div>
      </section>
    </div>
  </Tabs.Content>

  <Tabs.Content value="integrations" class="mt-6">
    <div class="flex flex-col gap-8">
      <!-- Publishing tokens -->
      <section class="rounded-card border border-border bg-background p-6">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">Publishing tokens</h2>
        <p class="mt-1 max-w-prose text-sm text-muted-foreground">
          Publish here from a CMS, build hook, or script.
          <a
            href="https://docs.omicron.blog/reference/content-webhook/"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-4 hover:text-foreground">Learn more</a
          >
        </p>

        <div class="mt-4">
          <WebhookTokensManager initial={data.webhookTokens} />
        </div>
      </section>
    </div>
  </Tabs.Content>
</Tabs.Root>

{#if data.user.email}
  <ChangeEmailDialog bind:open={emailOpen} username={data.user.username} email={data.user.email} />
{/if}

<Dialog.Root bind:open={pwOpen} onOpenChange={onPwOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Change password</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        Enter your current password, then choose a new one.
      </Dialog.Description>

      <form onsubmit={(e) => (e.preventDefault(), changePassword())}>
        <div class="mt-5 flex flex-col gap-4">
          <UsernameHint username={data.user.username} />
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
          {#if pwError}<p class="text-sm text-destructive">{pwError}</p>{/if}
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <Dialog.Close
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <Button type="submit" variant="solid" disabled={pwBusy || !currentPassword || !newPassword}>
            {pwBusy ? "Saving…" : "Update password"}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen} onOpenChange={onDeleteOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Delete account</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        This permanently deletes <strong class="text-foreground">@{data.user.username}</strong> and everything in it. Enter
        your password to confirm.
      </Dialog.Description>

      <form onsubmit={(e) => (e.preventDefault(), deleteAccount())}>
        <div class="mt-5 flex flex-col gap-1.5">
          <UsernameHint username={data.user.username} />
          <Label.Root for="delete-password" class={labelClass}>Password</Label.Root>
          <input
            id="delete-password"
            type="password"
            bind:value={deletePassword}
            autocomplete="current-password"
            class={field}
          />
          {#if deleteError}<p class="text-sm text-destructive">{deleteError}</p>{/if}
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <Dialog.Close
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <Button type="submit" variant="destructive" disabled={deleting || deletePassword.length === 0}>
            {deleting ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
