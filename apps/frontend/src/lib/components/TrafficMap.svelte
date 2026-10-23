<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script module lang="ts">
  import { geoNaturalEarth1, geoPath } from "d3-geo";
  import codes from "i18n-iso-countries/codes.json";
  import { feature } from "topojson-client";
  import type { GeometryCollection, Topology } from "topojson-specification";
  import world from "world-atlas/countries-110m.json";

  const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const countries = feature(topology, topology.objects.countries);
  const path = geoPath(
    geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [596, 316],
      ],
      countries,
    ),
  );
  const alpha2 = new Map(codes.map((row) => [row[2], row[0]]));
  const locations = countries.features.map((country, index) => ({
    id: `${country.id}-${index}`,
    code: alpha2.get(String(country.id).padStart(3, "0")) ?? "",
    name: country.properties.name,
    path: path(country) ?? "",
  }));
</script>

<script lang="ts">
  let { rows }: { rows: { value: string; pageviews: number }[] } = $props();
  const counts = $derived(new Map(rows.map((r) => [r.value, r.pageviews])));
  const maximum = $derived(Math.max(1, ...rows.map((r) => r.pageviews)));
</script>

<section class="min-w-0 rounded-card border border-border bg-background p-5">
  <h3 class="text-sm font-semibold text-foreground">Pageviews by country</h3>
  <svg
    viewBox="0 0 600 320"
    class="mt-4 w-full"
    role="img"
    aria-label="World map showing approximate pageview locations by country"
  >
    {#each locations as location (location.id)}
      {@const count = counts.get(location.code) ?? 0}
      <path
        d={location.path}
        class={count ? "fill-accent stroke-background" : "fill-muted stroke-background"}
        fill-opacity={count ? 0.25 + (0.75 * Math.log1p(count)) / Math.log1p(maximum) : 1}
        stroke-width="0.4"><title>{location.name}: {count.toLocaleString("en")} pageviews</title></path
      >
    {/each}
  </svg>
  <p class="mt-3 text-xs text-muted-foreground">
    Approximate network location, not residence. VPNs and proxies affect accuracy.
  </p>
  <p class="mt-1 text-xs text-muted-foreground">
    Boundaries: <a
      href="https://www.naturalearthdata.com/about/terms-of-use/"
      target="_blank"
      rel="noreferrer"
      class="underline">Natural Earth</a
    >
    (public domain), via
    <a href="https://github.com/topojson/world-atlas" target="_blank" rel="noreferrer" class="underline">world-atlas</a
    >.
  </p>
</section>
