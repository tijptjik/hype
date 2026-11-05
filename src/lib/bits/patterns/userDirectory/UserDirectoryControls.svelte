<script lang="ts">
// BITS
import Button from '#lib/bits/core/button/Button.svelte'
import RangeSlider from '#lib/bits/core/slider/RangeSlider.svelte'
import * as Control from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
import { ResourceSortControl } from '#lib/bits/patterns/resource/resourceSortControl/index.js'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
import StatusIcon from 'virtual:icons/proicons/shield-checkmark'
import ContactIcon from 'virtual:icons/proicons/mail'
import ProfileIcon from 'virtual:icons/proicons/person'
import LanguageIcon from 'virtual:icons/proicons/globe'
import CalendarIcon from 'virtual:icons/proicons/calendar'
// TYPES
import type { DirectoryFilters, DirectoryJoinedRange } from './userDirectory.types'
let {
  count,
  filters = {},
  joinedRange = null,
  onFiltersChange,
  archived,
  hasEmail,
  hasTelephone,
  onHasEmailChange,
  onHasTelephoneChange,
  sorting,
  onArchivedChange,
  onSortingChange,
  onReset,
}: {
  joinedRange?: DirectoryJoinedRange | null
  filters?: DirectoryFilters
  onFiltersChange?: (value: DirectoryFilters) => void
  count: number
  hasEmail: boolean | null
  hasTelephone: boolean | null
  onHasEmailChange: (value: boolean | null) => void
  onHasTelephoneChange: (value: boolean | null) => void
  archived: boolean | null
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  onArchivedChange: (value: boolean | null) => void
  onSortingChange: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
  onReset: () => void
} = $props()
const sortables = {
  items: [
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'createdAt', label: 'Joined' },
    { value: 'updatedAt', label: 'Updated' },
  ],
}
const sections = [
  { key: 'status', title: 'Status', icon: StatusIcon },
  { key: 'contact', title: 'Contact', icon: ContactIcon },
  { key: 'profile', title: 'Profile', icon: ProfileIcon },
  { key: 'language', title: 'Language', icon: LanguageIcon },
  { key: 'joined', title: 'Joined', icon: CalendarIcon },
] as const
let activeSection = $state<string | null>(null)
const active = $derived(sections.find(section => section.key === activeSection))
const counts = $derived({
  status: Number(archived !== false) + Number(typeof filters.isAnonymous === 'boolean'),
  contact:
    Number(hasEmail !== null) +
    Number(hasTelephone !== null) +
    Number(typeof filters.emailVerified === 'boolean'),
  profile: [filters.hasUsername, filters.hasImage, filters.hasAttribution].filter(
    value => typeof value === 'boolean',
  ).length,
  language: Number(Boolean(filters.locale)),
  joined: Number(Boolean(filters.joinedFrom)) + Number(Boolean(filters.joinedTo)),
})
const totalFilters = $derived(
  Object.values(counts).reduce((sum, count) => sum + count, 0),
)
const DAY = 86_400_000
const firstDay = $derived(joinedRange ? Math.floor(joinedRange.from / DAY) : 0)
const lastDay = $derived(joinedRange ? Math.floor(joinedRange.to / DAY) : firstDay + 1)
let joinedDays = $state<number[]>([0, 1])
$effect(() => {
  joinedDays = [
    filters.joinedFrom ? Math.floor(Date.parse(filters.joinedFrom) / DAY) : firstDay,
    filters.joinedTo ? Math.floor(Date.parse(filters.joinedTo) / DAY) : lastDay,
  ]
})

/** Format a calendar-day slider position for its persistent label and accessible value.
 * @param day UTC day number.
 * @returns Readable day, month and year.
 */
function formatDay(day: number): string {
  return new Date(day * DAY).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Apply one filter while retaining selections in the other groups.
 * @param patch Updated filter values; undefined clears a selection.
 * @returns Nothing.
 */
function change(patch: Partial<DirectoryFilters>): void {
  onFiltersChange?.({ ...filters, ...patch })
}

/** Commit the selected days when dragging or keyboard adjustment settles.
 * @param days Ordered start and end day numbers.
 * @returns Nothing. Full-range endpoints clear their corresponding filter.
 */
function changeDates(days: number[]): void {
  change({
    joinedFrom:
      days[0] === firstDay
        ? undefined
        : new Date(days[0] * DAY).toISOString().slice(0, 10),
    joinedTo:
      days[1] === lastDay
        ? undefined
        : new Date(days[1] * DAY).toISOString().slice(0, 10),
  })
}
</script>

<Control.Root
  filterLabel={active?.title ?? 'Filter By'}
  filterIcon={active?.icon ?? FilterIcon}
  hasActiveSection={Boolean(active)}
  {count}
  resetDisabled={totalFilters === 0 &&
    sorting.sortBy === 'name' &&
    sorting.sortOrder === 'asc'}
  onReset={() => {
    joinedDays = [firstDay, lastDay]
    onReset()
  }}
>
  {#snippet filterMenuContent({ closeMenu, notifyLayoutChange })}
    {#each sections as section}
      <Button
        text={section.title}
        iconComponent={section.icon}
        style="transparent"
        size="sm"
        iconClasses="h-4 w-4 min-[1400px]:h-5 min-[1400px]:w-5"
        class="text-base-content/70 data-[has-indicator=true]:after:bg-accent relative h-10 min-w-0 rounded-md px-1.5 text-xs data-[has-indicator=true]:after:absolute data-[has-indicator=true]:after:top-0 data-[has-indicator=true]:after:right-0 data-[has-indicator=true]:after:size-2 data-[has-indicator=true]:after:rounded-full min-[1400px]:px-2.5 min-[1400px]:text-sm"
        attrs={{
          'data-has-indicator': counts[section.key] > 0,
          'aria-pressed': activeSection === section.key,
          'aria-label': counts[section.key]
            ? `${section.title}, ${counts[section.key]} active filters`
            : section.title,
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
      {#if activeSection === 'status'}
        <Control.TriStateToggle
          label="Archived"
          falseLabel="Hide"
          trueLabel="Only"
          currentValue={archived}
          onCheckedChange={onArchivedChange}
        />
        <Control.TriStateToggle
          label="Guest account"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={filters.isAnonymous ?? null}
          onCheckedChange={value => change({ isAnonymous: value })}
        />
      {:else if activeSection === 'contact'}
        <Control.TriStateToggle
          label="Phone number"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={hasTelephone}
          onCheckedChange={onHasTelephoneChange}
        />
        <Control.TriStateToggle
          label="Email address"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={hasEmail}
          onCheckedChange={onHasEmailChange}
        />
        <Control.TriStateToggle
          label="Email verified"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={filters.emailVerified ?? null}
          onCheckedChange={value => change({ emailVerified: value })}
        />
      {:else if activeSection === 'profile'}
        <Control.TriStateToggle
          label="Username"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={filters.hasUsername ?? null}
          onCheckedChange={value => change({ hasUsername: value })}
        />
        <Control.TriStateToggle
          label="Profile image"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={filters.hasImage ?? null}
          onCheckedChange={value => change({ hasImage: value })}
        />
        <Control.TriStateToggle
          label="Attribution"
          falseLabel="No"
          trueLabel="Yes"
          currentValue={filters.hasAttribution ?? null}
          onCheckedChange={value => change({ hasAttribution: value })}
        />
      {:else if activeSection === 'language'}
        <Control.FilterSelect
          label="Language"
          placeholder="All languages"
          value={filters.locale ?? ''}
          items={[
            { value: 'en', label: 'English' },
            { value: 'zh-hant', label: '繁體中文' },
            { value: 'zh-hans', label: '简体中文' },
          ]}
          onValueChange={value =>
            change({
              locale: value ? (value as DirectoryFilters['locale']) : undefined,
            })}
        />
      {:else if activeSection === 'joined'}
        <div class="flex w-96 max-w-[calc(100vw-48rem)] min-w-48 flex-col gap-1 px-2">
          <div
            class="text-base-content/75 flex justify-between gap-4 text-xs tabular-nums"
          >
            <span>{joinedRange ? formatDay(joinedDays[0]) : 'No joined dates'}</span>
            <span>{joinedRange ? formatDay(joinedDays[1]) : ''}</span>
          </div>
          <RangeSlider
            bind:value={joinedDays}
            min={firstDay}
            max={Math.max(firstDay + 1, lastDay)}
            disabled={!joinedRange || firstDay === lastDay}
            labels={['Joined from', 'Joined to']}
            formatValue={formatDay}
            onCommit={changeDates}
          />
        </div>
      {/if}
    </div>
  {/snippet}
  {#snippet sortContent({ isSortOpen, handleSortOpenChange })}
    <ResourceSortControl
      {sortables}
      {sorting}
      {onSortingChange}
      isOpen={isSortOpen}
      onOpenChange={handleSortOpenChange}
    />
  {/snippet}
</Control.Root>
