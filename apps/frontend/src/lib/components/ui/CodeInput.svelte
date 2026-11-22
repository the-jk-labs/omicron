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
  class="group/pininput flex w-full items-center text-foreground has-disabled:opacity-30"
>
  {#snippet children({ cells })}
    <div class="flex flex-1 rounded-input shadow-btn">
      {#each cells.slice(0, 3) as cell, i (i)}
        {@render Cell(cell)}
      {/each}
    </div>

    <div class="flex w-8 shrink-0 items-center justify-center" aria-hidden="true">
      <div class="h-1 w-3 rounded-full bg-border"></div>
    </div>

    <div class="flex flex-1 rounded-input shadow-btn">
      {#each cells.slice(3, 6) as cell, i (i)}
        {@render Cell(cell)}
      {/each}
    </div>
  {/snippet}
</PinInput.Root>

{#snippet Cell(cell: Cell)}
  <PinInput.Cell
    {cell}
    class="relative flex h-11 min-w-0 flex-1 items-center justify-center border-y border-r border-input bg-background text-lg font-medium text-foreground tabular-nums transition-all duration-75 group-focus-within/pininput:border-foreground/40 group-hover/pininput:border-foreground/40 first:rounded-l-input first:border-l last:rounded-r-input data-active:z-10 data-active:ring-1 data-active:ring-foreground"
  >
    {#if cell.char !== null}
      <div>{cell.char}</div>
    {/if}
    {#if cell.hasFakeCaret}
      <div class="pointer-events-none absolute inset-0 flex animate-caret-blink items-center justify-center">
        <div class="h-5 w-px bg-foreground"></div>
      </div>
    {/if}
  </PinInput.Cell>
{/snippet}
