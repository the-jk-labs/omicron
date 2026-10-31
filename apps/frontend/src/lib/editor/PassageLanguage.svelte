<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { Editor } from "@tiptap/core";
  import { Dialog, Label, Select, Toolbar } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";

  let { editor }: { editor: Editor } = $props();
  const id = $props.id();
  let open = $state(false);
  let language = $state("");
  let direction = $state("");
  let error = $state("");
  const directions = [
    { value: "", label: "Inherit" },
    { value: "auto", label: "Automatic" },
    { value: "ltr", label: "Left to right" },
    { value: "rtl", label: "Right to left" },
  ];

  function show() {
    const attributes = editor.getAttributes("textLanguage");
    language = attributes.lang ?? "";
    direction = attributes.dir ?? "";
    error = "";
    open = true;
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    let tag = language.trim();
    try {
      if (tag) tag = Intl.getCanonicalLocales(tag)[0];
    } catch {
      error = "Enter a valid language tag, such as en, fr, or pt-BR.";
      return;
    }
    editor
      .chain()
      .focus()
      .setMark("textLanguage", { lang: tag || null, dir: direction || null })
      .run();
    open = false;
  }
</script>

<Toolbar.Button
  onclick={show}
  aria-label="Text language"
  title="Text language"
  class="inline-flex size-10 shrink-0 items-center justify-center rounded-9px bg-background-alt transition-all hover:bg-muted active:scale-[0.98] active:bg-dark-10"
>
  <Icon name="languages" size={18} />
</Toolbar.Button>
<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Text language</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground"
        >Select a passage before opening this control. Mark its language when it differs from the article, so assistive
        technology can pronounce it correctly. Leave the tag empty to inherit.</Dialog.Description
      >
      <form onsubmit={save} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for={`${id}-language`} class="text-sm leading-none font-medium">Language tag</Label.Root>
          <input
            id={`${id}-language`}
            bind:value={language}
            placeholder="fr"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden focus:border-foreground"
          />
        </div>
        <Select.Root type="single" bind:value={direction}>
          <Select.Trigger
            aria-label="Text direction"
            class="inline-flex h-10 w-full items-center justify-between gap-2 rounded-input border border-border-input bg-background px-3 text-sm shadow-btn outline-hidden transition-colors focus:border-foreground"
          >
            {directions.find((item) => item.value === direction)?.label ?? "Inherit"}
            <Icon name="chevronDown" size={15} />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              sideOffset={6}
              class="z-50 w-(--bits-select-anchor-width) rounded-card border border-muted bg-background p-1 shadow-popover"
            >
              <Select.Viewport>
                {#each directions as item (item.value)}
                  <Select.Item
                    {...item}
                    class="flex h-9 w-full items-center gap-2 rounded-button px-2 text-sm outline-hidden select-none data-highlighted:bg-muted"
                    >{item.label}</Select.Item
                  >
                {/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        {#if error}<p id={`${id}-error`} role="alert" class="text-sm text-destructive">{error}</p>{/if}
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
            >Cancel</Dialog.Close
          >
          <Button type="submit" variant="solid">Save</Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
