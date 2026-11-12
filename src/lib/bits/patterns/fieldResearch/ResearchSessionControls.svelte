<script lang="ts">
// BITS
import * as Control from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
import ResourceSortControl from '#lib/bits/patterns/resource/resourceSortControl/ResourceSortControl.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
import Button from '#lib/bits/core/button/Button.svelte'
// SERVICES
import { createSortable, createSortables } from '#lib/client/services/filters.js'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
import AssociationIcon from 'virtual:icons/lucide/link'
import StatusIcon from 'virtual:icons/proicons/target'
// TYPES
import type { ResourceBulkEditConfig } from '#lib/client/services/bulkEdit.types.js'
import ResourceBulkEditControl from '#lib/bits/patterns/resource/resourceControlBar/ResourceBulkEditControl.svelte'
import type { ResearchSessionFilters } from '#lib/fieldResearch/model.js'

let {
  value,
  options,
  count,
  loading,
  onchange,
  bulk,
}: {
  bulk: ResourceBulkEditConfig
  value: ResearchSessionFilters
  options: Record<
    'creators' | 'organisations' | 'projects' | 'layers',
    { value: string; label: string }[]
  >
  count: number
  loading: boolean
  onchange: (value: ResearchSessionFilters) => void
} = $props()
const fields = [
  { key: 'creatorId', label: 'Creator', options: 'creators' },
  { key: 'organisationId', label: 'Organisation', options: 'organisations' },
  { key: 'projectId', label: 'Project', options: 'projects' },
  { key: 'layerId', label: 'Layer', options: 'layers' },
] as const
let active = $state<'association' | 'status' | null>(null)
const sortables = createSortables([
  createSortable('createdAt', 'Date'),
  createSortable('name', 'Title'),
])
const filtered = $derived(fields.some(field => Boolean(value[field.key])))
</script>

<Control.Root
  filterLabel={active === 'association'
    ? 'Association'
    : active === 'status'
      ? 'Status'
      : 'Filter By'}
  showBulkEdit={true}
  filterIcon={active === 'association'
    ? AssociationIcon
    : active === 'status'
      ? StatusIcon
      : FilterIcon}
  hasActiveSection={Boolean(active)}
  {count}
  countLoading={loading}
  resetDisabled={!filtered &&
    value.archive === 'active' &&
    value.sortBy === 'createdAt' &&
    value.sortOrder === 'desc'}
  onReset={() =>
    onchange({
      archive: 'active',
      creatorId: '',
      organisationId: '',
      projectId: '',
      layerId: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })}
>
  {#snippet filterMenuContent({ closeMenu, notifyLayoutChange })}
    <Button
      text="Association"
      iconComponent={AssociationIcon}
      iconClasses="h-5 w-5"
      color={filtered ? 'primary' : 'neutral'}
      style="transparent"
      size="sm"
      onClick={() => {
        active = 'association'
        closeMenu()
        notifyLayoutChange()
      }}
    />
    <Button
      text="Status"
      iconComponent={StatusIcon}
      iconClasses="h-5 w-5"
      style="transparent"
      size="sm"
      onClick={() => {
        active = 'status'
        closeMenu()
        notifyLayoutChange()
      }}
    />
  {/snippet}
  {#snippet filterActiveContent()}
    {#if active === 'association'}
      <section
        class="flex max-w-[max(160px,calc(100cqw-560px))] gap-2 overflow-x-auto py-1"
        aria-label="Association filters"
      >
        {#each fields as field}
          <Select
            placeholder={`Any ${field.label.toLowerCase()}`}
            value={value[field.key]}
            items={options[field.options]}
            allowDeselect={true}
            triggerClass="h-10 w-40 rounded-full px-3 text-sm"
            onValueChange={next => onchange({ ...value, [field.key]: next })}
          />
        {/each}
      </section>
    {:else if active === 'status'}
      <Control.FilterSelect
        label="Archive"
        placeholder="Archive status"
        value={value.archive}
        allowDeselect={false}
        items={[
          { value: 'active', label: 'Not archived' },
          { value: 'archived', label: 'Archived' },
          { value: 'all', label: 'All sessions' },
        ]}
        onValueChange={next =>
          onchange({ ...value, archive: next as ResearchSessionFilters['archive'] })}
      />
    {/if}
  {/snippet}
  {#snippet bulkContent({ isBulkOpen, handleBulkOpenChange })}
    <ResourceBulkEditControl
      config={bulk}
      isOpen={isBulkOpen}
      onOpenChange={handleBulkOpenChange}
    />
  {/snippet}
  {#snippet sortContent({ isSortOpen, handleSortOpenChange })}
    <ResourceSortControl
      {sortables}
      sorting={{ sortBy: value.sortBy, sortOrder: value.sortOrder }}
      isOpen={isSortOpen}
      onOpenChange={handleSortOpenChange}
      onSortingChange={next =>
        onchange({
          ...value,
          sortBy: next.sortBy === 'name' ? 'name' : 'createdAt',
          sortOrder: next.sortOrder,
        })}
    />
  {/snippet}
</Control.Root>
