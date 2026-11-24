<script lang="ts">
// COMPONENTS
import Root from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarRoot.svelte'
import TriStateToggle from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
import ResourceSortControl from '#lib/bits/patterns/resource/resourceSortControl/ResourceSortControl.svelte'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
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
  creatorId,
  creators,
  hasRecords,
  onCreatorChange,
  onRecordsChange,
  onReset,
}: {
  showArchive: boolean
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  onSortingChange: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
  archived: boolean | null
  count: number
  onChange: (value: boolean | null) => void
  creatorId: string
  creators: { value: string; label: string }[]
  hasRecords: boolean | null
  onCreatorChange: (value: string) => void
  onRecordsChange: (value: boolean | null) => void
  onReset: () => void
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
  resetDisabled={archived === false && !creatorId && hasRecords === null}
  {onReset}
>
  {#snippet filterActiveContent()}
    <div class="flex h-16 min-w-0 items-center gap-6 overflow-x-auto px-4">
      <div class="w-64 shrink-0">
        <SearchSelect
          label="Filter by creator"
          plain
          clearOnOpen
          selectedToken
          value={creatorId}
          items={[{ value: '__all__', label: 'All creators' }, ...creators]}
          onSelect={value => onCreatorChange(value === '__all__' ? '' : value)}
        />
      </div>
      <TriStateToggle
        class="shrink-0"
        label="Records"
        alwaysShowLabels
        falseLabel="None"
        trueLabel="Has"
        currentValue={hasRecords}
        onCheckedChange={onRecordsChange}
      />
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
