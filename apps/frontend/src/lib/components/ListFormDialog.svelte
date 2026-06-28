<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Dialog, Switch, Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { ReadingList } from "$lib/types";

  // Create or edit a reading list. In create mode (`list` omitted) visibility
  // defaults to public, matching the product rule that new lists are public.
  // The Read later list keeps its name, so its title field is locked.
  let {
    list = undefined,
    onSaved,
    children,
  }: {
    list?: ReadingList;
    onSaved: (list: ReadingList) => void;
    // Receives the trigger props to spread onto a single clickable element.
    children: import("svelte").Snippet<[Record<string, unknown>]>;
  } = $props();

  const editing = $derived(!!list);

  let open = $state(false);
  let title = $state("");
  let description = $state("");
  let isPrivate = $state(false);
  let saving = $state(false);
  let error = $state("");

  // Seed the form from the list each time the dialog opens.
  function onOpenChange(next: boolean) {
    open = next;
    if (!next) return;
    title = list?.title ?? "";
    description = list?.description ?? "";
    isPrivate = list ? list.visibility === "private" : false;
    error = "";
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (saving) return;
    if (!list?.isReadLater && !title.trim()) {
      error = "A list needs a title.";
      return;
    }
    saving = true;
    error = "";
    const visibility = isPrivate ? "private" : "public";
    try {
      const saved = list
        ? (await endpoints().updateList(list.id, {
          ...(list.isReadLater ? {} : { title: title.trim() }),
          description: description.trim(),
          visibility,
        })).list
        : (await endpoints().createList({
          title: title.trim(),
          description: description.trim(),
          visibility,
        })).list;
      onSaved(saved);
      open = false;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Trigger>
    {#snippet child({ props })}
      {@render children(props)}
    {/snippet}
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border sm:max-w-[440px]"
    >
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <Dialog.Title class="text-foreground text-base font-semibold tracking-tight">
          {editing ? "Edit list" : "New list"}
        </Dialog.Title>
        <Dialog.Close
          class="text-muted-foreground hover:text-foreground focus-visible:outline-none"
          aria-label="Close"
        >
          <Icon name="close" size={18} />
        </Dialog.Close>
      </div>

      <form onsubmit={submit} class="flex flex-col gap-4 px-5 py-5">
        {#if !list?.isReadLater}
          <div class="flex flex-col gap-1.5">
            <Label.Root for="list-title" class="text-sm font-medium text-foreground">Title</Label.Root>
            <input
              id="list-title"
              bind:value={title}
              maxlength="100"
              placeholder="e.g. Weekend reads"
              class="rounded-input border-border bg-background h-10 border px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
          </div>
        {/if}

        <div class="flex flex-col gap-1.5">
          <Label.Root for="list-description" class="text-sm font-medium text-foreground">
            Description <span class="text-muted-foreground">(optional)</span>
          </Label.Root>
          <textarea
            id="list-description"
            bind:value={description}
            maxlength="500"
            rows="3"
            placeholder="What's this list about?"
            class="rounded-input border-border bg-background resize-none border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          ></textarea>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-col">
            <Label.Root for="list-private" class="text-sm font-medium text-foreground">
              Private
            </Label.Root>
            <span class="text-xs text-muted-foreground">Only you can see private lists.</span>
          </div>
          <Switch.Root
            id="list-private"
            bind:checked={isPrivate}
            class="focus-visible:ring-foreground focus-visible:ring-offset-background data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 peer inline-flex h-[28px] min-h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Switch.Thumb
              class="bg-background data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 pointer-events-none block size-[22px] shrink-0 rounded-full transition-transform"
            />
          </Switch.Root>
        </div>

        {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

        <div class="flex justify-end gap-2 pt-1">
          <Dialog.Close>
            {#snippet child({ props })}
              <Button {...props} type="button" variant="outline" size="sm">Cancel</Button>
            {/snippet}
          </Dialog.Close>
          <Button type="submit" variant="solid" size="sm" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
