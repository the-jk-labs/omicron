<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Semantic `<time>` wrapper. Every date the reader sees goes through here so
  the markup is correct (`datetime` for machines, localized text for humans),
  the timezone is discoverable (title), and recent dates can show nisbi zaman
  ("2 gün əvvəl") in the reader's own locale.

  - `iso` — ISO-8601 string from the API (always UTC).
  - `kind` — "date" | "datetime" | "time" (default "datetime").
  - `relative` — when true, dates within ~30 days render as localized relative
    time ("3 days ago" / "3 gün əvvəl") with the absolute time in the title.
  - `withZone` — append the short zone label visibly (e.g. "GMT+4").
-->
<script lang="ts">
  import { formatDate, formatDateTime, formatRelative, formatTime, zoneLabel } from "$lib/format";
  import { locale } from "$lib/locale";
  import { timeZone } from "$lib/timezone";

  let {
    iso,
    kind = "datetime",
    relative = false,
    withZone = false,
    class: klass = "",
  }: {
    iso: string;
    kind?: "date" | "datetime" | "time";
    relative?: boolean;
    withZone?: boolean;
    class?: string;
  } = $props();

  const display = $derived.by(() => {
    const tz = $timeZone;
    const loc = $locale;
    if (relative) {
      const age = Math.abs(Date.now() - new Date(iso).getTime());
      // 30 days: beyond that "3 months ago" is less useful than the calendar date.
      if (age < 30 * 24 * 60 * 60 * 1000) return formatRelative(iso, loc);
    }
    if (kind === "date") return formatDate(iso, tz, loc);
    if (kind === "time") return formatTime(iso, tz, loc);
    return formatDateTime(iso, tz, loc);
  });

  // Full absolute time + offset for the tooltip and for assistive tech.
  // `Intl` already localizes the zone name when a locale is passed.
  const tooltip = $derived.by(() => {
    const tz = $timeZone;
    const loc = $locale;
    try {
      const abs = formatDateTime(iso, tz, loc);
      const zl = zoneLabel(tz, loc);
      return zl ? `${abs} ${zl}` : abs;
    } catch {
      return iso;
    }
  });
</script>

<time datetime={iso} title={tooltip} class={klass}
  >{display}{#if withZone}{" "}{zoneLabel($timeZone, $locale)}{/if}</time
>
