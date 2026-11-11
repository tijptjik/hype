<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import ChangelogActorSearch from './ChangelogActorSearch.svelte'
import RangeSlider from '#lib/bits/core/slider/RangeSlider.svelte'
import * as Control from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
import ResourceIcon from 'virtual:icons/proicons/layers'
import ActionIcon from 'virtual:icons/proicons/arrow-sync'
import ActorIcon from 'virtual:icons/proicons/person'
import PeriodIcon from 'virtual:icons/proicons/calendar'
import CategoryIcon from 'virtual:icons/proicons/grid'
import SourceIcon from 'virtual:icons/proicons/database'
// PRESENTATION
import { changelogActions } from '#lib/revisions/changelogFilters.js'
// TYPES
import type {
  ChangelogFilters,
  ChangelogFilterOptions,
} from '#lib/revisions/changelog.js'

let {
  label = 'Changelog filters',
  filters,
  options,
  onChange,
  count = null,
  countLoading = false,
}: {
  label?: string
  count?: number | null
  countLoading?: boolean
  filters: ChangelogFilters
  options: ChangelogFilterOptions | null
  onChange: (filters: ChangelogFilters) => void
} = $props()
const sections = [
  { key: 'resourceType', icon: ResourceIcon, label: 'Resource type' },
  { key: 'action', icon: ActionIcon, label: 'Action' },
  { key: 'actor', icon: ActorIcon, label: 'Actor' },
  { key: 'period', icon: PeriodIcon, label: 'Period' },
  { key: 'category', icon: CategoryIcon, label: 'Category' },
  { key: 'origin', icon: SourceIcon, label: 'Source' },
] as const
let activeSection = $state<(typeof sections)[number]['key'] | null>(null)
const active = $derived(sections.find(section => section.key === activeSection))
const DAY = 86_400_000
const firstDay = $derived(
  options?.period ? Math.floor(Date.parse(options.period.from) / DAY) : 0,
)
const lastDay = $derived(
  options?.period ? Math.floor(Date.parse(options.period.to) / DAY) : firstDay,
)
// Calendar shortcuts use inclusive UTC days, with weeks beginning Monday.
const today = new Date()
const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) / DAY
const nextMonthStart =
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1) / DAY
const previousMonthStart =
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1) / DAY
const weekStart = Math.floor(today.getTime() / DAY) - ((today.getUTCDay() + 6) % 7)
const presets = [
  { label: 'This week', from: weekStart, to: weekStart + 6 },
  { label: 'Previous week', from: weekStart - 7, to: weekStart - 1 },
  { label: 'This month', from: monthStart, to: nextMonthStart - 1 },
  { label: 'Previous month', from: previousMonthStart, to: monthStart - 1 },
]
const sliderMin = $derived(Math.min(firstDay, ...presets.map(preset => preset.from)))
const sliderMax = $derived(Math.max(lastDay, ...presets.map(preset => preset.to)))
let days = $state<number[]>([0, 1])
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
      values[0] === sliderMin
        ? undefined
        : new Date(values[0] * DAY).toISOString().slice(0, 10),
    to:
      values[1] === sliderMax
        ? undefined
        : new Date(values[1] * DAY).toISOString().slice(0, 10),
  })
}
</script>

<fieldset class="min-w-0 shrink-0 border-0 p-0" aria-label={label}>
  <div class="w-full overflow-x-auto">
    <Control.Root
      class="min-w-[64rem]"
      filterLabel={active?.label ?? 'Filter By'}
      filterIcon={active?.icon ?? FilterIcon}
      hasActiveSection={Boolean(active)}
      showSort={false}
      {count}
      {countLoading}
      resetDisabled={!hasFilters}
      onReset={() => onChange({})}
    >
      {#snippet filterMenuContent({ closeMenu, notifyLayoutChange })}
        {#each sections as section}
          {@const selected =
            section.key === 'period'
              ? Boolean(filters.from || filters.to)
              : Boolean(filters[section.key])}
          <Button
            text={section.label}
            iconComponent={section.icon}
            style="transparent"
            size="sm"
            iconClasses="h-4 w-4 min-[1400px]:h-5 min-[1400px]:w-5"
            class="text-base-content/70 data-[has-indicator=true]:after:bg-accent relative h-10 min-w-0 rounded-md px-1.5 text-xs data-[has-indicator=true]:after:absolute data-[has-indicator=true]:after:top-0 data-[has-indicator=true]:after:right-0 data-[has-indicator=true]:after:size-2 data-[has-indicator=true]:after:rounded-full min-[1400px]:px-2.5 min-[1400px]:text-sm"
            attrs={{
              'data-has-indicator': selected,
              'aria-pressed': activeSection === section.key,
              'aria-label': selected
                ? `${section.label}, active filter`
                : section.label,
            }}
            onClick={() => {
              activeSection = section.key
              closeMenu()
              notifyLayoutChange()
            }}
          />
        {/each}
      {/snippet}
      {#snippet filterActiveContent()}
        <div class="flex h-16 items-center gap-5">
          {#if activeSection === 'resourceType'}
            <Control.FilterSelect
              label="Resource type"
              placeholder="All resource types"
              value={filters.resourceType ?? ''}
              items={[
                'hub',
                'organisation',
                'project',
                'layer',
                'feature',
                'property',
              ].map(value => ({
                value,
                label:
                  value === 'property'
                    ? 'Field'
                    : value[0].toUpperCase() + value.slice(1),
              }))}
              onValueChange={value =>
                change({
                  resourceType: (value ||
                    undefined) as ChangelogFilters['resourceType'],
                })}
            />
          {:else if activeSection === 'action'}
            <Control.FilterSelect
              label="Action"
              placeholder="All actions"
              value={filters.action ?? ''}
              items={[...changelogActions]}
              onValueChange={value =>
                change({ action: (value || undefined) as ChangelogFilters['action'] })}
            />
          {:else if activeSection === 'actor'}
            <ChangelogActorSearch
              actors={options?.actors ?? []}
              value={filters.actor}
              onChange={actor => change({ actor })}
            />
          {:else if activeSection === 'period'}
            <div class="flex w-96 min-w-48 flex-col gap-1 px-2">
              <div
                class="text-base-content/75 flex justify-between gap-3 text-xs tabular-nums"
              >
                <span
                  >{options?.period ? formatDay(days[0]) : 'No recorded dates'}</span
                >
                <span>{options?.period ? formatDay(days[1]) : ''}</span>
              </div>
              <RangeSlider
                bind:value={days}
                min={sliderMin}
                max={Math.max(sliderMin + 1, sliderMax)}
                disabled={!options?.period}
                labels={['Changes from', 'Changes to']}
                formatValue={formatDay}
                onCommit={changeDates}
              />
            </div>
            <fieldset
              class="flex shrink-0 items-center gap-1 border-0 p-0"
              aria-label="Date range shortcuts"
            >
              {#each presets as preset}
                {@const from = new Date(preset.from * DAY).toISOString().slice(0, 10)}
                {@const to = new Date(preset.to * DAY).toISOString().slice(0, 10)}
                {@const selected = filters.from === from && filters.to === to}
                <Button
                  text={preset.label}
                  size="sm"
                  style={selected ? 'soft' : 'ghost'}
                  color={selected ? 'primary' : 'neutral'}
                  class="shrink-0 whitespace-nowrap"
                  attrs={{ 'aria-pressed': selected }}
                  onClick={() => change({ from, to })}
                />
              {/each}
            </fieldset>
          {:else if activeSection === 'category'}
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
                change({
                  category: (value || undefined) as ChangelogFilters['category'],
                })}
            />
          {:else if activeSection === 'origin'}
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
          {/if}
        </div>
      {/snippet}
    </Control.Root>
  </div>
</fieldset>
