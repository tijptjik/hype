<script lang="ts">
// SVELTE
import { getContext } from 'svelte'
// CONTEXT
import { HEADER_CTRL_KEY, type HeaderCtrl } from '#lib/context/header.svelte.js'
// COMPONENTS
import ChangelogFilters from './components/ChangelogFilters.svelte'
// PRESENTATION
import { historyFilterOptions } from '#lib/revisions/historyFilters.js'
// TYPES
import type {
  ChangelogEntry,
  ChangelogFilters as Filters,
} from '#lib/revisions/changelog.js'

let {
  showStaff = false,
  entries,
  count = null,
  loading = false,
  onChange,
}: {
  showStaff?: boolean
  entries: ChangelogEntry[]
  count?: number | null
  loading?: boolean
  onChange?: (filters: Filters) => void
} = $props()
const headerCtrl = getContext<HeaderCtrl | undefined>(HEADER_CTRL_KEY)
const options = $derived(historyFilterOptions(entries))
</script>

{#if headerCtrl?.historyFiltersVisible}
  <ChangelogFilters
    label="History filters"
    {showStaff}
    filters={{
      ...headerCtrl.historyFilters,
      search: headerCtrl.historyQuery || undefined,
    }}
    {options}
    {count}
    countLoading={loading}
    onChange={filters => {
      const { search, ...selections } = filters
      headerCtrl.historyQuery = search ?? ''
      headerCtrl.historyFilters = selections
      onChange?.(selections)
    }}
  />
{/if}
