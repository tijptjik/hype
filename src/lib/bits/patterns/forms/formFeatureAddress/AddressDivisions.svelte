<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import { divisionClassLabel } from '#lib/divisions/classes.js'
import { divisionIcons } from '#lib/divisions/icons.js'
// API
import { getAddressDivisionContext } from '#lib/api/division.remote.js'
// DOMAIN
import {
  SUBJECTIVE_DIVISIONS,
  authoredDivisionOverrides,
  addressDivisionName,
  effectiveAddressDivisions,
} from '#lib/addresses/divisions.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type {
  AddressDivisionContext,
  AddressDivisionOverrides,
  SubjectiveDivisionField,
} from '#lib/addresses/divisions.js'

let {
  address,
  coordinates,
  isEditing = false,
  onChange,
}: {
  address: FeatureAddress
  coordinates: number[]
  isEditing?: boolean
  onChange: (address: FeatureAddress) => void
} = $props()
let result = $state<{ key: string; context: AddressDivisionContext } | null>(null)
let loading = $state(false)
let failed = $state(false)
let showAll = $state(false)
let retry = $state(0)
const key = $derived(JSON.stringify(coordinates.slice(0, 2)))
const context = $derived(result?.key === key ? result.context : null)
const overrides = $derived({
  ...authoredDivisionOverrides(address.source.authored),
  ...address.source.divisionOverrides,
  ...address.divisionOverrides,
})
const divisions = $derived(context ? effectiveAddressDivisions(context, overrides) : [])
const subjective = $derived(
  Object.entries(SUBJECTIVE_DIVISIONS).filter(
    ([field, kind]) =>
      showAll ||
      divisions.some(item => item.class === kind) ||
      Object.hasOwn(overrides, field),
  ),
)
const labels = $derived<Record<string, string>>({
  country: m.address_division_country(),
  sar: m.address_division_sar(),
  area: m.address_division_area(),
  district: m.address_division_district(),
  major_island: m.address_division_island(),
  minor_island: m.address_division_island(),
  islet: m.address_division_islet(),
  town: m.address_division_town(),
  rural_area: m.address_division_rural_area(),
  macrohood: m.address_division_macrohood(),
  neighbourhood: m.address_division_neighbourhood(),
  village: m.address_division_village(),
  microhood: m.address_division_microhood(),
  hamlet: m.address_division_hamlet(),
})
$effect(() => {
  const requestKey = key
  const refresh = retry
  let cancelled = false
  loading = true
  failed = false
  const request = getAddressDivisionContext({
    coordinates: [coordinates[0], coordinates[1]],
  })
  Promise.resolve(refresh ? request.refresh().then(() => request) : request)
    .then(value => {
      if (cancelled) return
      result = { key: requestKey, context: value }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})

/** Set one language-independent subjective selection; absence inherits current marker membership.
 * @param field Editable geographic role. @param value Stable identity, omission or marker inheritance.
 * @returns Nothing; persistence stays with the owning Location or Feature form.
 */
function select(field: SubjectiveDivisionField, value: string): void {
  const next: AddressDivisionOverrides = { ...address.divisionOverrides }
  if (value === '__marker') next[field] = { mode: 'marker' }
  else next[field] = value || null
  onChange({ ...address, divisionOverrides: next })
}
</script>

<section
  class="space-y-4 border-t border-border pt-5"
  aria-label={m.feature_address_divisions()}
  data-address-divisions
>
  <div>
    <h3 class="font-semibold">{m.feature_address_divisions()}</h3>
    <p class="mt-1 text-sm text-muted-foreground">{m.address_divisions_policy()}</p>
  </div>
  {#if loading}
    <p role="status" class="text-sm text-muted-foreground">
      {m.feature_address_divisions_loading()}
    </p>
  {:else if failed}
    <div role="alert" class="text-sm text-destructive">
      {m.feature_address_divisions_failed()}
      <button type="button" class="underline" onclick={() => retry++}>
        {m.address_divisions_retry()}
      </button>
    </div>
  {:else if !context?.available}
    <p role="status" class="text-sm text-muted-foreground">
      {m.feature_address_divisions_unloaded()}
    </p>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each divisions as division (division.id)}
        {@const Icon =
          divisionIcons[division.class as keyof typeof divisionIcons] ??
          divisionIcons.area}
        {@const factual = !Object.values(SUBJECTIVE_DIVISIONS).some(
          kind => kind === division.class,
        )}
        <div
          class="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
          title={factual
            ? m.address_divisions_factual()
            : m.address_divisions_subjective()}
        >
          <Icon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="text-sm"
            >{addressDivisionName(division, getLocaleKey())}<span
              class="ml-1.5 text-xs text-muted-foreground"
              >{labels[division.class] ?? divisionClassLabel(division.class)}</span
            ></span
          >
          {#if factual}
            <LockIcon
              class="size-3 text-muted-foreground"
              aria-label={m.address_divisions_factual()}
            />
          {/if}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">
          {m.feature_address_divisions_empty()}
        </p>
      {/each}
    </div>
  {/if}
  {#if isEditing && context && !loading && !failed}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each subjective as [field, kind]}
        {@const automatic = context.memberships.filter(item => item.class === kind)}
        {@const selection =
          typeof overrides[field as SubjectiveDivisionField] === 'object' &&
          overrides[field as SubjectiveDivisionField] !== null
            ? '__marker'
            : Object.hasOwn(overrides, field)
              ? (overrides[field as SubjectiveDivisionField] ?? '')
              : '__marker'}
        <label class="flex min-w-0 flex-col gap-1 text-sm"
          >{labels[kind]}
          <select
            class="min-h-11 w-full rounded-lg border border-border bg-panel px-3"
            value={selection}
            onchange={event =>
              select(field as SubjectiveDivisionField, event.currentTarget.value)}
          >
            <option value="__marker">
              {m.address_divisions_from_marker()}{automatic.length
                ? ` · ${automatic.map(item => addressDivisionName(item, getLocaleKey())).join(' / ')}`
                : ''}
            </option>
            <option value="">{m.address_divisions_omit()}</option>
            {#each context.options
              .filter(item => item.class === kind)
              .sort((a, b) =>
                addressDivisionName(a, getLocaleKey()).localeCompare(
                  addressDivisionName(b, getLocaleKey()),
                ),
              ) as option}
              <option value={option.id}>
                {addressDivisionName(option, getLocaleKey())}
              </option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
    <button
      type="button"
      class="min-h-10 text-sm text-primary hover:underline"
      aria-expanded={showAll}
      onclick={() => (showAll = !showAll)}
    >
      {m.address_divisions_edit_localities()}
    </button>
  {/if}
</section>
