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
  sorting,
  onArchivedChange,
  onSortingChange,
  onReset,
}: {
  count: number
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
    sorting.sortBy === 'name' &&
    sorting.sortOrder === 'asc'}
  {onReset}
>
  {#snippet filterMenuContent()}
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
