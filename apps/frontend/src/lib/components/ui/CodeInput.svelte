<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { PinInput, type PinInputRootSnippetProps } from "bits-ui";
  import { totpDigits } from "#lib/twoFactor.js";

  // A 6-digit one-time code, styled as the Bits UI docs' PinInput demo.
  // Remaining props (name, data-*) land on the real <input>, which `id` labels.
  let {
    id,
    value = $bindable(""),
    ...rest
  }: { id: string; value?: string; name?: string } & { [data: `data-${string}`]: string | boolean } = $props();

  type Cell = PinInputRootSnippetProps["cells"][0];

  // Strip non-digits before PinInput reads the value, so pasted "123 456" or "12-34-56" still fits.
  // (Its `pattern` would reject the whole value instead.)
  const digitsOnly = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    input.value = totpDigits(input.value);
  };
</script>

<PinInput.Root
  bind:value
  inputId={id}
  maxlength={6}
  {...rest}
  oninput={digitsOnly}
  class="group/pininput flex items-center text-foreground has-disabled:opacity-30"
>
  {#snippet children({ cells })}
    <div class="flex">
      {#each cells.slice(0, 3) as cell, i (i)}
        {@render Cell(cell)}
      {/each}
    </div>

    <div class="flex w-10 items-center justify-center">
      <div class="h-1 w-3 rounded-full bg-border"></div>
    </div>

    <div class="flex">
      {#each cells.slice(3, 6) as cell, i (i)}
        {@render Cell(cell)}
      {/each}
    </div>
  {/snippet}
</PinInput.Root>

{#snippet Cell(cell: Cell)}
  <PinInput.Cell
    {cell}
    class="relative flex h-14 w-10 items-center justify-center border-y border-r border-foreground/20 text-[2rem] text-foreground outline-0 transition-all duration-75 group-focus-within/pininput:border-foreground/40 group-hover/pininput:border-foreground/40 first:rounded-l-md first:border-l last:rounded-r-md data-active:outline-1 data-active:outline-foreground"
  >
    {#if cell.char !== null}
      <div>{cell.char}</div>
    {/if}
    {#if cell.hasFakeCaret}
      <div class="pointer-events-none absolute inset-0 flex animate-caret-blink items-center justify-center">
        <div class="h-8 w-px bg-foreground"></div>
      </div>
    {/if}
  </PinInput.Cell>
{/snippet}
