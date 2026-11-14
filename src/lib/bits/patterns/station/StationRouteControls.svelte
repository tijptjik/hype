<script lang="ts">
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// COMPONENTS
import IndoorRoutePlanner from './IndoorRoutePlanner.svelte'
// DATA
import { findIndoorRoute } from '#lib/indoor/routing.js'
import { value } from '#lib/indoor/model.js'
const station = getAppCtx().station
const entrances = $derived(
  station.data?.amenity_point.features
    .filter(f => f.properties.amenity_category === 'entry')
    .toSorted(
      (a, b) =>
        Number(b.properties.level_ordinal) - Number(a.properties.level_ordinal) ||
        value(a.properties, 'amenity_name_en').localeCompare(
          value(b.properties, 'amenity_name_en'),
        ),
    ) ?? [],
)
const targets = $derived(station.entries.filter(p => p.kind === 'shop'))
const origins = $derived(
  entrances.map(f => ({
    id: value(f.properties, 'amenity_id'),
    name: value(f.properties, 'amenity_name_en'),
    label: `${value(f.properties, 'amenity_name_en')} · ${value(f.properties, 'level_short_name_en')}`,
  })),
)
const destinations = $derived(
  targets.map(p => ({
    id: p.id,
    name: p.name.en,
    label: `${p.name.en} ${p.code}`.trim(),
  })),
)
/** Applies a route only while its source station remains active. @param origin Source entrance ID. @param destination Source destination ID. @param fly Whether to animate. @returns Whether a route exists. */
async function preview(
  origin: string,
  destination: string,
  fly: boolean,
): Promise<boolean> {
  const data = station.data,
    entrance = entrances.find(f => f.properties.amenity_id === origin),
    target = targets.find(p => p.id === destination)
  if (!data || !entrance || !target) return false
  station.clearRoute()
  const route = await findIndoorRoute(data, entrance, target)
  if (station.data !== data || !station.active) return false
  if (!route) return false
  station.selected = null
  station.exploded = true
  station.route = route
  if (fly && !matchMedia('(prefers-reduced-motion: reduce)').matches) station.flyRoute()
  return true
}
</script>
{#key station.data}
  <IndoorRoutePlanner
    {origins}
    {destinations}
    onPlan={preview}
    onStop={() => station.stopFly()}
    onClear={() => station.clearRoute()}
    flying={station.routeMode === 'flying'}
    hasRoute={Boolean(station.route)}
  >
    {#snippet status()}
      {#if station.route}
        <p role="status" class="text-muted-foreground mt-2" data-route-status>
          {station.routeMode === 'arrived' ? 'Arrived · ' : ''}{station.route.entrance}
          → {station.route.destination} · ~{Math.round(station.route.metres)}
          m
          {#if station.route.requiresPaidAccess}
            <strong class="text-warning block">Requires paid-area access</strong>
          {/if}
        </p>
      {/if}
    {/snippet}
  </IndoorRoutePlanner>
{/key}
