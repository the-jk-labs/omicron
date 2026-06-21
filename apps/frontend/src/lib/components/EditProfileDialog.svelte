<script lang="ts">
  import { Dialog, Label } from "bits-ui";
  import { invalidateAll } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { User } from "$lib/types";

  let { user }: { user: User } = $props();

  let open = $state(false);

  // Form state — seeded from the user whenever the dialog opens.
  let displayName = $state(user.displayName);
  let bio = $state(user.bio);
  let file = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  let error = $state("");
  let busy = $state(false);

  const MAX_BYTES = 2 * 1024 * 1024;

  // Reset the form to the current user each time the dialog is opened.
  function onOpenChange(next: boolean) {
    open = next;
    if (next) {
      displayName = user.displayName;
      bio = user.bio;
      clearFile();
      error = "";
    }
  }

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
    busy = true;
    try {
      if (file) await endpoints().uploadAvatar(file);
      await endpoints().updateProfile({ displayName, bio });
      await invalidateAll();
      open = false;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to save changes.";
    } finally {
      busy = false;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Trigger
    class="border-input text-foreground shadow-btn hover:bg-muted inline-flex h-10 select-none items-center justify-center gap-1.5 rounded-input border px-4 text-sm font-medium active:scale-[0.98]"
  >
    <Icon name="edit" size={16} /> Edit profile
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[480px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Edit profile
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        Update how you appear across the fediverse.
      </Dialog.Description>

      <div class="mt-6 flex flex-col gap-5">
        <!-- Avatar -->
        <div class="flex items-center gap-4">
          <button
            type="button"
            onclick={() => fileInput?.click()}
            class="group relative rounded-full"
            aria-label="Change profile picture"
          >
            <Avatar name={displayName || user.displayName} src={previewUrl ?? user.avatarUrl ?? undefined} size={72} />
            <span
              class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Icon name="camera" size={20} />
            </span>
          </button>
          <div class="flex flex-col gap-1.5">
            <Button variant="outline" class="h-9 px-3 text-sm" onclick={() => fileInput?.click()}>
              <Icon name="camera" size={15} /> Change photo
            </Button>
            <p class="text-muted-foreground text-xs">PNG, JPEG, WebP or GIF · max 2 MB</p>
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
          <p class="text-muted-foreground self-end text-xs">{bio.length}/500</p>
        </div>

        {#if error}<p class="text-destructive text-sm">{error}</p>{/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button variant="solid" class="h-10 px-5 text-sm" disabled={busy} onclick={save}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Dialog.Close
        class="text-muted-foreground hover:text-foreground focus-visible:outline-none absolute right-4 top-4"
        aria-label="Close"
      >
        <Icon name="close" size={18} />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
