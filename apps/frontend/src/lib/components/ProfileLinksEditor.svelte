<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Select } from "bits-ui";
  import Icon from "$lib/components/Icon.svelte";
  import ProfileLinkIcon from "$lib/components/ProfileLinkIcon.svelte";
  import { inputPrefix, PLATFORMS, platformMeta } from "$lib/profileLinks";
  import type { ProfileLink } from "$lib/types";

  // Editor for a user's featured profile links: an ordered list of
  // platform + URL rows, with add / remove / reorder. Bound two-way; the parent
  // saves the whole array (the backend replaces the set transactionally).
  const MAX_LINKS = 10;

  let { links = $bindable([]) }: { links?: ProfileLink[] } = $props();

  const atLimit = $derived(links.length >= MAX_LINKS);

  function addLink() {
    if (atLimit) return;
    links = [...links, { platform: "website", url: "", label: "" }];
  }

  function removeAt(i: number) {
    links = links.filter((_, idx) => idx !== i);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    links = next;
  }

  function setPlatform(i: number, platform: string) {
    links = links.map((l, idx) => (idx === i ? { ...l, platform } : l));
  }

  const triggerClass =
    "rounded-input border-border-input bg-background shadow-btn data-[placeholder]:text-muted-foreground inline-flex h-10 w-40 shrink-0 items-center justify-between gap-2 border px-3 text-sm transition-colors focus:border-foreground outline-none";
  const inputClass =
    "rounded-input border-input bg-background shadow-btn placeholder:text-muted-foreground focus:border-foreground h-10 w-full border px-3 text-sm outline-none transition-colors";
  const inputWrapClass =
    "rounded-input border-input bg-background shadow-btn focus-within:border-foreground flex h-10 w-full items-center border px-3 text-sm transition-colors";
  const bareInputClass =
    "placeholder:text-muted-foreground text-foreground w-full min-w-0 bg-transparent outline-none";
  const iconBtnClass =
    "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-button transition-colors disabled:pointer-events-none disabled:opacity-40";
</script>

<div class="flex flex-col gap-2.5">
  {#each links as link, i (i)}
    {@const meta = platformMeta(link.platform)}
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select.Root type="single" value={link.platform} onValueChange={(v) => setPlatform(i, v)}>
        <Select.Trigger class={triggerClass} aria-label="Link type">
          <span class="flex min-w-0 items-center gap-2">
            <ProfileLinkIcon platform={link.platform} size={16} />
            <span class="truncate">{meta.label}</span>
          </span>
          <Icon name="chevronDown" size={15} class="text-muted-foreground shrink-0" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            class="border-muted bg-background shadow-popover rounded-card z-50 max-h-72 overflow-y-auto border p-1"
            sideOffset={6}
          >
            <Select.Viewport>
              {#each PLATFORMS as p (p.key)}
                <Select.Item
                  value={p.key}
                  label={p.label}
                  class="rounded-button data-[highlighted]:bg-muted flex h-9 w-44 select-none items-center gap-2 px-2 text-sm outline-none"
                >
                  {#snippet children({ selected })}
                    <ProfileLinkIcon platform={p.key} size={16} />
                    <span class="truncate">{p.label}</span>
                    {#if selected}
                      <Icon name="check" size={15} class="text-foreground ml-auto" />
                    {/if}
                  {/snippet}
                </Select.Item>
              {/each}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {#if meta.input.kind === "handle"}
        <div class={inputWrapClass}>
          <span class="text-muted-foreground shrink-0 select-none">{inputPrefix(meta)}</span>
          <input
            type="text"
            bind:value={link.url}
            placeholder={meta.placeholder}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class={bareInputClass}
          />
        </div>
      {:else}
        <input
          type={meta.input.kind === "url" ? "url" : "text"}
          bind:value={link.url}
          placeholder={meta.placeholder}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class={inputClass}
        />
      {/if}

      <div class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          class={iconBtnClass}
          onclick={() => move(i, -1)}
          disabled={i === 0}
          aria-label="Move up"
        >
          <Icon name="chevronDown" size={16} class="rotate-180" />
        </button>
        <button
          type="button"
          class={iconBtnClass}
          onclick={() => move(i, 1)}
          disabled={i === links.length - 1}
          aria-label="Move down"
        >
          <Icon name="chevronDown" size={16} />
        </button>
        <button
          type="button"
          class={iconBtnClass}
          onclick={() => removeAt(i)}
          aria-label="Remove link"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </div>

    {#if link.platform === "custom"}
      <input
        type="text"
        bind:value={link.label}
        placeholder="Label (e.g. My portfolio)"
        maxlength={60}
        class={`${inputClass} sm:w-40`}
      />
    {/if}
  {/each}

  <div>
    <button
      type="button"
      onclick={addLink}
      disabled={atLimit}
      class="text-foreground hover:bg-muted rounded-button inline-flex h-9 items-center gap-1.5 px-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon name="plus" size={16} /> Add link
    </button>
  </div>
  <p class="text-muted-foreground text-xs">
    {links.length}/{MAX_LINKS} links — shown on your profile. Drag-free reordering with the arrows.
  </p>
</div>
