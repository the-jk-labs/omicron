<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Suggests people while an `@handle` is typed in a comment textarea, the thread's
  own participants first. Bits UI's Combobox needs its own <input>, so this is a
  small listbox attached to the textarea, styled like the Combobox content.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { endpoints } from "#lib/api/index.js";
  import Avatar from "#lib/components/ui/Avatar.svelte";
  import { activeMention, insertMention, mergeSuggestions, type ActiveMention } from "#lib/mentions.js";
  import type { RelationActor } from "#lib/types.js";

  type Person = Pick<RelationActor, "id" | "username" | "displayName" | "avatarUrl">;

  let {
    textarea,
    value,
    onPick,
    participants = [],
  }: {
    textarea: HTMLTextAreaElement | null;
    value: string;
    onPick: (text: string) => void;
    participants?: Person[];
  } = $props();

  const id = $props.id();
  let active = $state<ActiveMention | null>(null);
  let results = $state<Person[]>([]);
  let highlighted = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const people = $derived(active ? mergeSuggestions(active.query, participants, active.query ? results : [], 6) : []);
  const open = $derived(people.length > 0);

  function refresh() {
    if (!textarea) return;
    active = activeMention(textarea.value, textarea.selectionStart ?? textarea.value.length);
    highlighted = 0;
    clearTimeout(timer);
    const query = active?.query;
    if (!query) {
      results = [];
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await endpoints().search(query, "people");
        if (active?.query === query) results = res.people;
      } catch {
        results = [];
      }
    }, 200);
  }

  async function pick(person: Person) {
    if (!active || !textarea) return;
    const next = insertMention(value, active, person.username);
    active = null;
    onPick(next.text);
    await tick();
    textarea.focus();
    textarea.setSelectionRange(next.caret, next.caret);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      highlighted = (highlighted + step + people.length) % people.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      void pick(people[highlighted]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      active = null;
    }
  }

  function close() {
    active = null;
  }

  function onKeyup(e: KeyboardEvent) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) refresh();
  }

  $effect(() => {
    const el = textarea;
    if (!el) return;
    el.addEventListener("input", refresh);
    el.addEventListener("click", refresh);
    el.addEventListener("keydown", onKeydown);
    el.addEventListener("keyup", onKeyup);
    el.addEventListener("blur", close);
    el.setAttribute("aria-autocomplete", "list");
    return () => {
      clearTimeout(timer);
      el.removeEventListener("input", refresh);
      el.removeEventListener("click", refresh);
      el.removeEventListener("keydown", onKeydown);
      el.removeEventListener("keyup", onKeyup);
      el.removeEventListener("blur", close);
    };
  });

  $effect(() => {
    if (!textarea) return;
    // Both may only name elements that exist, so they come and go with the list.
    if (open) {
      textarea.setAttribute("aria-controls", `${id}-list`);
      textarea.setAttribute("aria-activedescendant", `${id}-${highlighted}`);
    } else {
      textarea.removeAttribute("aria-controls");
      textarea.removeAttribute("aria-activedescendant");
    }
  });
</script>

{#if open}
  <ul
    id={`${id}-list`}
    role="listbox"
    aria-label="People to mention"
    class="absolute top-full left-0 z-10 mt-1 max-h-72 w-72 overflow-auto rounded-card border border-border bg-background p-1 shadow-popover"
  >
    {#each people as person, i (person.id)}
      <!-- Keyboard selection lives on the textarea (aria-activedescendant); the mouse picks here. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={`${id}-${i}`}
        role="option"
        aria-selected={i === highlighted}
        data-highlighted={i === highlighted ? "" : undefined}
        class="flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-button px-2.5 text-sm outline-hidden select-none data-highlighted:bg-muted"
        onmousedown={(e) => e.preventDefault()}
        onmouseenter={() => (highlighted = i)}
        onclick={() => void pick(person)}
      >
        <Avatar name={person.displayName} src={person.avatarUrl ?? undefined} size={28} />
        <span class="min-w-0">
          <span class="block truncate font-medium text-foreground">{person.displayName}</span>
          <span class="block truncate text-xs text-muted-foreground">@{person.username}</span>
        </span>
      </li>
    {/each}
  </ul>
{/if}
