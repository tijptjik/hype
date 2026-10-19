<script lang="ts">
// BITS
import * as Control from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
import { ResourceSortControl } from '#lib/bits/patterns/resource/resourceSortControl/index.js'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
// TYPES
let {
  count,
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
</script>

<Control.Root
  filterLabel="Filter By"
  filterIcon={FilterIcon}
  {count}
  resetDisabled={archived === false &&
    hasEmail === null &&
    hasTelephone === null &&
    sorting.sortBy === 'name' &&
    sorting.sortOrder === 'asc'}
  {onReset}
>
  {#snippet filterMenuContent()}
    <Control.TriStateToggle
      class="min-w-44"
      label="Has phone number"
      falseLabel="No"
      trueLabel="Yes"
      currentValue={hasTelephone}
      onCheckedChange={onHasTelephoneChange}
    />
    <Control.TriStateToggle
      class="min-w-44"
      label="Has email address"
      falseLabel="No"
      trueLabel="Yes"
      currentValue={hasEmail}
      onCheckedChange={onHasEmailChange}
    />
    <Control.TriStateToggle
      label="Archived"
      falseLabel="Hide"
      trueLabel="Only"
      currentValue={archived}
      onCheckedChange={onArchivedChange}
    />
  {/snippet}
  {#snippet sortContent({
    isSortOpen,
    handleSortOpenChange,
  })}
    <ResourceSortControl
      {sortables}
      {sorting}
      {onSortingChange}
      isOpen={isSortOpen}
      onOpenChange={handleSortOpenChange}
    />
  {/snippet}
</Control.Root>
