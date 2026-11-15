<script lang="ts">
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// COMPONENTS
import IndoorRoutePlanner from './IndoorRoutePlanner.svelte'
// DATA
import { findIndoorRoute } from '#lib/indoor/routing.js'
import {
  type PaidPolicy,
  loadStationNetwork,
  findSourceIndoorRoute,
} from '#lib/indoor/navigation/sourceGraph.js'
import { value } from '#lib/indoor/model.js'
let useSourceNetwork = $state(false)
let paidPolicy = $state<PaidPolicy>('prefer-unpaid')
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
  const sourceNetwork = useSourceNetwork,
    policy = paidPolicy
  const route =
    station.isMtr && sourceNetwork
      ? findSourceIndoorRoute(
          await loadStationNetwork(station.code),
          data,
          entrance,
          target,
          policy,
        )
      : await findIndoorRoute(data, entrance, target)
  if (
    station.data !== data ||
    sourceNetwork !== useSourceNetwork ||
    policy !== paidPolicy ||
    !station.active ||
    !targets.some(place => place.id === destination)
  )
    return false
  if (!route) return false
  station.selected = null
  station.exploded = true
  station.route = route
  if (fly && !matchMedia('(prefers-reduced-motion: reduce)').matches) station.flyRoute()
  return true
}
</script>
{#if station.isMtr}
  <label class="mb-2 flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      bind:checked={useSourceNetwork}
      onchange={() => station.clearRoute()}
    >
    Use detailed station paths (experimental)
  </label>
  {#if useSourceNetwork}
    <label class="mb-2 grid gap-1 text-sm"
      >Paid areas
      <select
        aria-label="Paid-area policy"
        bind:value={paidPolicy}
        onchange={() => station.clearRoute()}
        class="bg-surface rounded p-2"
      >
        <option value="prefer-unpaid">Prefer unpaid paths</option>
        <option value="unpaid-only">Unpaid paths only</option>
        <option value="paid-allowed">Allow paid areas</option>
      </select>
    </label>
  {/if}
{/if}
{#key station.data}
  <IndoorRoutePlanner
    preferenceLabel={useSourceNetwork && paidPolicy === 'unpaid-only'
      ? 'Unpaid paths only'
      : useSourceNetwork && paidPolicy === 'paid-allowed'
        ? 'Paid areas allowed'
        : 'Unpaid routes preferred'}
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
