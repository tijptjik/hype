<script lang="ts">
// COMPONENTS
import Root from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarRoot.svelte'
import TriStateToggle from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
import ResourceSortControl from '#lib/bits/patterns/resource/resourceSortControl/ResourceSortControl.svelte'
// SERVICES
import { createSortable, createSortables } from '#lib/client/services/filters.js'
// ICONS
import StatusIcon from 'virtual:icons/proicons/target'
let {
  archived,
  count,
  onChange,
  showArchive,
  sorting,
  onSortingChange,
}: {
  showArchive: boolean
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  onSortingChange: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
  archived: boolean | null
  count: number
  onChange: (value: boolean | null) => void
} = $props()
const sortables = createSortables([
  createSortable('createdAt', 'Created'),
  createSortable('name', 'Name'),
])
</script>
<Root
  filterLabel="Status"
  filterIcon={StatusIcon}
  hasActiveSection
  disableMenuToggle
  {count}
  resetDisabled={archived === false}
  onReset={() => onChange(false)}
>
  {#snippet filterActiveContent()}
    <div class="flex h-16 items-center gap-6 px-4">
      {#if showArchive}
        <TriStateToggle
          label="Archived"
          alwaysShowLabels
          falseLabel="Not"
          trueLabel="Is"
          currentValue={archived}
          onCheckedChange={onChange}
        />
      {/if}
    </div>
  {/snippet}
  {#snippet sortContent(args: {
    isSortOpen: boolean
    handleSortOpenChange: (isOpen: boolean) => Promise<void>
  })}
    <ResourceSortControl
      {sorting}
      {onSortingChange}
      {sortables}
      isOpen={args.isSortOpen}
      onOpenChange={args.handleSortOpenChange}
    />
  {/snippet}
</Root>
