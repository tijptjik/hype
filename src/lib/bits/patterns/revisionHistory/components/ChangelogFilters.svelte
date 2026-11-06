<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import RangeSlider from '#lib/bits/core/slider/RangeSlider.svelte'
import * as Control from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
// PRESENTATION
import { changelogActions } from '#lib/revisions/changelogFilters.js'
// TYPES
import type {
  ChangelogFilters,
  ChangelogFilterOptions,
} from '#lib/revisions/changelog.js'

let {
  filters,
  options,
  onChange,
}: {
  filters: ChangelogFilters
  options: ChangelogFilterOptions | null
  onChange: (filters: ChangelogFilters) => void
} = $props()
const sections = [
  { key: 'resourceType', label: 'Resource type' },
  { key: 'action', label: 'Action' },
  { key: 'actor', label: 'Actor' },
  { key: 'period', label: 'Period' },
  { key: 'category', label: 'Category' },
  { key: 'origin', label: 'Source' },
  { key: 'search', label: 'Search' },
] as const
let active = $state<(typeof sections)[number]['key']>('resourceType')
const DAY = 86_400_000
const firstDay = $derived(
  options?.period ? Math.floor(Date.parse(options.period.from) / DAY) : 0,
)
const lastDay = $derived(
  options?.period ? Math.floor(Date.parse(options.period.to) / DAY) : firstDay,
)
let days = $state<number[]>([0, 1])
const actorItems = $derived(
  options?.actors.map(actor => ({
    value: JSON.stringify([actor.origin, actor.id]),
    label: actor.label,
  })) ?? [],
)
const actorValue = $derived(
  filters.actor ? JSON.stringify([filters.actor.origin, filters.actor.id]) : '',
)
const hasFilters = $derived(
  Object.values(filters).some(value => value !== undefined && value !== ''),
)
$effect(() => {
  days = [
    filters.from ? Math.floor(Date.parse(filters.from) / DAY) : firstDay,
    filters.to ? Math.floor(Date.parse(filters.to) / DAY) : lastDay,
  ]
})

/** Apply one selection while retaining other filter sections.
 * @param patch Changed selections; undefined clears a selection.
 * @returns Nothing.
 */
function change(patch: Partial<ChangelogFilters>): void {
  onChange({ ...filters, ...patch })
}

/** Format the same UTC calendar-day positions as the user-directory slider.
 * @param day UTC day number.
 * @returns Persistent readable label and accessible thumb value.
 */
function formatDay(day: number): string {
  return new Date(day * DAY).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Commit inclusive day bounds after the user finishes dragging or using the keyboard.
 * @param values Start and end UTC day numbers.
 * @returns Nothing; full-range endpoints clear their filters.
 */
function changeDates(values: number[]): void {
  change({
    from:
      values[0] === firstDay
        ? undefined
        : new Date(values[0] * DAY).toISOString().slice(0, 10),
    to:
      values[1] === lastDay
        ? undefined
        : new Date(values[1] * DAY).toISOString().slice(0, 10),
  })
}
</script>

<fieldset
  class="border-border bg-base-200 min-w-0 shrink-0 border-b px-4 py-2"
  aria-label="Changelog filters"
>
  <div class="flex flex-wrap items-center gap-1">
    {#each sections as section}
      {@const selected =
        section.key === 'period'
          ? Boolean(filters.from || filters.to)
          : Boolean(filters[section.key])}
      <Button
        text={section.label}
        size="sm"
        style="transparent"
        class="text-base-content/70 aria-pressed:bg-primary/10 aria-pressed:text-primary data-[active=true]:after:bg-accent relative h-9 rounded-md px-2 text-xs data-[active=true]:after:absolute data-[active=true]:after:top-1 data-[active=true]:after:right-0 data-[active=true]:after:size-1.5 data-[active=true]:after:rounded-full"
        attrs={{
          'aria-pressed': active === section.key,
          'data-active': selected,
          'aria-label': selected ? `${section.label}, active filter` : section.label,
        }}
        onClick={() => (active = section.key)}
      />
    {/each}
    <div class="ml-auto">
      <Control.FilterReset disabled={!hasFilters} onClick={() => onChange({})} />
    </div>
  </div>
  <div
    class="flex min-h-16 min-w-0 flex-wrap items-center gap-3 py-2 [&>div]:max-w-full [&>div]:flex-wrap"
  >
    {#if active === 'resourceType'}
      <Control.FilterSelect
        label="Resource type"
        placeholder="All resource types"
        value={filters.resourceType ?? ''}
        items={['organisation', 'project', 'layer', 'feature', 'property'].map(
          value => ({
            value,
            label:
              value === 'property' ? 'Field' : value[0].toUpperCase() + value.slice(1),
          }),
        )}
        onValueChange={value =>
          change({
            resourceType: (value || undefined) as ChangelogFilters['resourceType'],
          })}
      />
    {:else if active === 'action'}
      <Control.FilterSelect
        label="Action"
        placeholder="All actions"
        value={filters.action ?? ''}
        items={[...changelogActions]}
        onValueChange={value =>
          change({ action: (value || undefined) as ChangelogFilters['action'] })}
      />
    {:else if active === 'actor'}
      <Control.FilterSelect
        label="Actor"
        placeholder="All actors"
        value={actorValue}
        items={actorItems}
        onValueChange={value => {
          const actor = options?.actors.find(
            actor => JSON.stringify([actor.origin, actor.id]) === value,
          )
          change({ actor: actor ? { id: actor.id, origin: actor.origin } : undefined })
        }}
      />
    {:else if active === 'period'}
      <div class="flex w-96 min-w-0 flex-col gap-1 px-2">
        <div
          class="text-base-content/75 flex justify-between gap-3 text-xs tabular-nums"
        >
          <span>{options?.period ? formatDay(days[0]) : 'No recorded dates'}</span>
          <span>{options?.period ? formatDay(days[1]) : ''}</span>
        </div>
        <RangeSlider
          bind:value={days}
          min={firstDay}
          max={Math.max(firstDay + 1, lastDay)}
          disabled={!options?.period || firstDay === lastDay}
          labels={['Changes from', 'Changes to']}
          formatValue={formatDay}
          onCommit={changeDates}
        />
        <span class="text-muted-foreground text-xs">Inclusive dates · UTC</span>
      </div>
    {:else if active === 'category'}
      <Control.FilterSelect
        label="Category"
        placeholder="All categories"
        value={filters.category ?? ''}
        items={[
          { value: 'profile', label: 'Profile' },
          { value: 'fields', label: 'Fields' },
          { value: 'publication', label: 'Publication' },
          { value: 'maintenance', label: 'Maintenance' },
        ]}
        onValueChange={value =>
          change({ category: (value || undefined) as ChangelogFilters['category'] })}
      />
    {:else if active === 'origin'}
      <Control.FilterSelect
        label="Source"
        placeholder="All sources"
        value={filters.origin ?? ''}
        items={[
          { value: 'user', label: 'User' },
          { value: 'system', label: 'System' },
          { value: 'import', label: 'Import' },
          { value: 'migration', label: 'Migration' },
          { value: 'restore', label: 'Restore' },
        ]}
        onValueChange={value =>
          change({ origin: (value || undefined) as ChangelogFilters['origin'] })}
      />
    {:else if active === 'search'}
      <label
        class="text-foreground/72 flex w-full max-w-lg flex-wrap items-center gap-3 text-sm font-medium"
      >
        Search
        <input
          type="search"
          aria-label="Search changes"
          maxlength="200"
          value={filters.search ?? ''}
          placeholder="Record, actor or reason…"
          class="border-foreground/10 bg-base-300 text-foreground focus-visible:ring-focus h-10 min-w-0 flex-1 rounded-full border px-4 text-sm font-normal outline-none focus-visible:ring-2"
          oninput={event => change({ search: event.currentTarget.value || undefined })}
        >
      </label>
    {/if}
  </div>
</fieldset>
