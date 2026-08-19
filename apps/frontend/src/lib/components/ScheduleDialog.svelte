<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { formatScheduleLong, timeUntil, zoneLabel } from "$lib/format";
  import { timeZone } from "$lib/timezone";
  import {
    type DateValue,
    now,
    parseAbsolute,
    Time,
    toCalendarDate,
    toCalendarDateTime,
    today,
    toZoned,
  } from "@internationalized/date";
  import { Calendar, Dialog, Label, TimeField } from "bits-ui";

  // Picks the moment a post goes out.
  //
  // The whole component is built around one hazard: the author is choosing a
  // wall-clock time, and the server stores an instant. Every value below is
  // therefore resolved in `$timeZone` — the reader's own zone, the same one
  // every rendered date on the site already uses — and only converted to an
  // absolute instant at the moment it is handed back. The zone is named on
  // screen next to the time, because "09:00 in whose morning?" is a question
  // with a wrong answer.

  let {
    open = $bindable(false),
    // The time already scheduled, when rescheduling. Seeds the pickers so the
    // dialog opens on the current choice rather than on a default that would
    // quietly discard it.
    current = null,
    onconfirm,
  }: {
    open?: boolean;
    current?: string | null;
    onconfirm: (isoInstant: string) => void;
  } = $props();

  const zone = $derived($timeZone);

  let date = $state<DateValue | undefined>();
  let time = $state<Time | undefined>();
  // Server-side rules the dialog cannot pre-empt (see resolvePublishAt in the
  // backend's services/posts.ts) still surface here rather than as a toast.
  let error = $state("");

  // Reseed every time the dialog opens: reopening it after a change must show
  // what is stored now, not what was picked the first time it was used.
  //
  // `parseAbsolute` reads the stored instant *in the display zone*, so a post
  // scheduled for 09:00 shows 09:00 to the author who set it — and shows the
  // corresponding local time to the same author reading it from another
  // country, which is the honest answer rather than a surprising one.
  $effect(() => {
    if (!open) return;
    const start = current ? parseAbsolute(current, zone) : defaultSlot();
    date = toCalendarDate(start);
    time = new Time(start.hour, start.minute);
    error = "";
  });

  // Tomorrow morning: the commonest thing anyone means by "later".
  function defaultSlot() {
    return toZoned(toCalendarDateTime(today(zone).add({ days: 1 }), new Time(9, 0)), zone);
  }

  // Nothing before today can be chosen; the finer "at least a minute from now"
  // rule is checked on confirm, since it depends on the time as well as the day.
  const minDate = $derived(today(zone));

  // The instant the two pickers currently describe, or null while either is
  // unset. This is the single place wall-clock becomes absolute.
  const chosen = $derived.by(() => {
    if (!date || !time) return null;
    return toZoned(toCalendarDateTime(date, time), zone).toDate();
  });

  const preview = $derived(chosen ? chosen.toISOString() : null);

  type Preset = { label: string; at: () => { date: DateValue; time: Time } };
  const presets: Preset[] = [
    {
      label: "In an hour",
      at: () => {
        const t = now(zone).add({ hours: 1 });
        return { date: toCalendarDate(t), time: new Time(t.hour, t.minute) };
      },
    },
    {
      label: "Tomorrow, 09:00",
      at: () => ({ date: today(zone).add({ days: 1 }), time: new Time(9, 0) }),
    },
    {
      label: "Next Monday, 09:00",
      at: () => {
        // `dayOfWeek` is not on the plain calendar type, so step forward a day
        // at a time until the local weekday reads Monday. At most seven hops,
        // and immune to whichever day the locale considers the week's first.
        let d = today(zone).add({ days: 1 });
        while (d.toDate(zone).getDay() !== 1) d = d.add({ days: 1 });
        return { date: d, time: new Time(9, 0) };
      },
    },
  ];

  function applyPreset(p: Preset) {
    const next = p.at();
    date = next.date;
    time = next.time;
    error = "";
  }

  function confirm() {
    if (!chosen) {
      error = "Pick a date and a time.";
      return;
    }
    // Mirrors the server's minimum lead. Checked here too so the author is told
    // immediately rather than after a round trip that would look like a bug.
    if (chosen.getTime() - Date.now() < 60_000) {
      error = "Pick a time at least a minute from now, or publish the post directly.";
      return;
    }
    onconfirm(chosen.toISOString());
    open = false;
  }

  const cellClass =
    "rounded-9px inline-flex size-9 items-center justify-center text-sm font-medium text-foreground " +
    "hover:bg-muted data-selected:bg-dark data-selected:text-background data-selected:font-semibold " +
    "data-disabled:pointer-events-none data-disabled:text-muted-foreground/40 " +
    "data-unavailable:text-muted-foreground/40 data-unavailable:line-through";
  const navClass =
    "inline-flex size-9 items-center justify-center rounded-9px text-foreground hover:bg-muted active:scale-[0.98]";
  const segmentClass =
    "rounded-9px px-1 py-0.5 text-foreground focus:bg-muted focus:outline-hidden data-[segment=literal]:text-muted-foreground";
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 max-h-[92vh] w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
        {current ? "Reschedule post" : "Schedule post"}
      </Dialog.Title>
      <Dialog.Description class="mt-1.5 text-sm text-foreground-alt">
        The post stays private until then, and publishes on its own.
      </Dialog.Description>

      <div class="mt-5 flex flex-wrap gap-2">
        {#each presets as preset (preset.label)}
          <Button onclick={() => applyPreset(preset)} variant="outline" size="xs">
            {preset.label}
          </Button>
        {/each}
      </div>

      <Calendar.Root
        class="mt-4 rounded-card border border-border bg-background-alt p-3"
        type="single"
        bind:value={date}
        minValue={minDate}
        weekdayFormat="short"
      >
        {#snippet children({ months, weekdays })}
          <Calendar.Header class="flex items-center justify-between">
            <Calendar.PrevButton class={navClass}>
              <Icon name="chevronLeft" size={18} />
            </Calendar.PrevButton>
            <Calendar.Heading class="text-sm font-semibold text-foreground" />
            <Calendar.NextButton class={navClass}>
              <Icon name="chevronRight" size={18} />
            </Calendar.NextButton>
          </Calendar.Header>
          {#each months as month (month.value)}
            <Calendar.Grid class="mt-2 w-full border-collapse select-none">
              <Calendar.GridHead>
                <Calendar.GridRow class="flex w-full justify-between">
                  {#each weekdays as day, i (i)}
                    <Calendar.HeadCell class="w-9 text-xs font-normal text-muted-foreground">
                      {day.slice(0, 2)}
                    </Calendar.HeadCell>
                  {/each}
                </Calendar.GridRow>
              </Calendar.GridHead>
              <Calendar.GridBody>
                {#each month.weeks as week, weekIndex (weekIndex)}
                  <Calendar.GridRow class="flex w-full justify-between">
                    {#each week as dayValue, dayIndex (dayIndex)}
                      <Calendar.Cell date={dayValue} month={month.value} class="p-0">
                        <Calendar.Day class={cellClass} />
                      </Calendar.Cell>
                    {/each}
                  </Calendar.GridRow>
                {/each}
              </Calendar.GridBody>
            </Calendar.Grid>
          {/each}
        {/snippet}
      </Calendar.Root>

      <TimeField.Root bind:value={time} hourCycle={24}>
        <div class="mt-4 flex items-center justify-between gap-3">
          <Label.Root class="text-sm font-medium text-foreground">
            {#snippet child({ props })}
              <TimeField.Label {...props}>Time</TimeField.Label>
            {/snippet}
          </Label.Root>
          <TimeField.Input
            class="inline-flex h-10 items-center rounded-input border border-input bg-background px-3 text-sm shadow-btn focus-within:ring-2 focus-within:ring-foreground/20"
          >
            {#snippet children({ segments })}
              <!-- Keyed by index, not by `part`: a time field emits more than one
                   `literal` segment, and a duplicate key is a hard render error —
                   which, thrown from inside a dialog, leaves the body scroll lock
                   applied and the whole page unclickable. -->
              {#each segments as segment, i (i)}
                <TimeField.Segment part={segment.part} class={segmentClass}>
                  {segment.value}
                </TimeField.Segment>
              {/each}
            {/snippet}
          </TimeField.Input>
        </div>
      </TimeField.Root>

      <p class="mt-4 rounded-card bg-muted px-3 py-2.5 text-sm text-foreground-alt">
        {#if preview}
          <span class="flex items-center gap-1.5 font-medium text-foreground">
            <Icon name="clock" size={14} />
            {formatScheduleLong(preview, zone)}
          </span>
          <span class="mt-0.5 block text-xs text-muted-foreground">
            {zoneLabel(zone)} · {timeUntil(preview)}
          </span>
        {:else}
          Pick a date and a time.
        {/if}
      </p>

      {#if error}<p class="mt-3 text-sm text-destructive">{error}</p>{/if}

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button onclick={confirm} variant="solid" class="h-10 px-5 text-sm">
          {current ? "Reschedule" : "Schedule"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
