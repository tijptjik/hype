<script lang="ts">
import { Checkbox } from '$lib/bits/custom'
import ChevronUpIcon from 'virtual:icons/lucide/chevron-up'
import ChevronDownIcon from 'virtual:icons/lucide/chevron-down'
import type { UserCapabilityMatrixProps } from '../userCapabilityMatrix.types'
import type { CapabilityKey } from '$lib/types'

let {
  capabilityKeys,
  capabilityLabelByKey,
  rows,
  isEditing = false,
  onToggleCell,
}: Omit<UserCapabilityMatrixProps, 'title' | 'subtitle'> = $props()

type SortKey = 'user' | CapabilityKey
type SortDirection = 'asc' | 'desc'

let sortKey = $state<SortKey>('user')
let sortDirection = $state<SortDirection>('asc')

const sortedRows = $derived.by(() => {
  const rowsCopy = [...rows]

  rowsCopy.sort((a, b) => {
    if (sortKey === 'user') {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      return sortDirection === 'asc' ? byName : -byName
    }

    const aHas = a.capabilities?.[sortKey] === true
    const bHas = b.capabilities?.[sortKey] === true

    if (aHas !== bHas) {
      if (sortDirection === 'asc') return aHas ? -1 : 1
      return aHas ? 1 : -1
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return rowsCopy
})

function setSort(nextSortKey: SortKey, nextSortDirection: SortDirection): void {
  sortKey = nextSortKey
  sortDirection = nextSortDirection
}
</script>

<div
  class="bits-user-capability-matrix__table-wrap"
  style={`--bits-user-capability-column-count:${Math.max(capabilityKeys.length, 1)};`}
>
  <table class="bits-user-capability-matrix__table">
    <thead>
      <tr>
        <th
          class="bits-user-capability-matrix__head-cell bits-user-capability-matrix__head-cell--user"
        >
          <div class="flex items-end justify-between gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-primary/90"
              >User</span
            >
            <span class="bits-user-capability-matrix__sort-buttons">
              <button
                type="button"
                class="bits-user-capability-matrix__sort-btn"
                class:bits-user-capability-matrix__sort-btn--active={sortKey === 'user' &&
                  sortDirection === 'asc'}
                aria-label="Sort users ascending"
                onclick={() => setSort('user', 'asc')}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                class="bits-user-capability-matrix__sort-btn"
                class:bits-user-capability-matrix__sort-btn--active={sortKey === 'user' &&
                  sortDirection === 'desc'}
                aria-label="Sort users descending"
                onclick={() => setSort('user', 'desc')}
              >
                <ChevronDownIcon />
              </button>
            </span>
          </div>
        </th>
        {#each capabilityKeys as capabilityKey (capabilityKey)}
          <th
            class="bits-user-capability-matrix__head-cell bits-user-capability-matrix__head-cell--capability"
          >
            <div class="flex h-full w-full flex-col items-center justify-end gap-1">
              <span
                class="block w-full text-center text-xxs tracking-wide normal-case whitespace-nowrap"
                >{capabilityLabelByKey[capabilityKey] ?? capabilityKey}</span
              >
              <span
                class="bits-user-capability-matrix__sort-buttons bits-user-capability-matrix__sort-buttons--capability"
              >
                <button
                  type="button"
                  class="bits-user-capability-matrix__sort-btn"
                  class:bits-user-capability-matrix__sort-btn--active={sortKey ===
                    capabilityKey && sortDirection === 'asc'}
                  aria-label={`Sort by ${capabilityLabelByKey[capabilityKey] ?? capabilityKey} with enabled first`}
                  onclick={() => setSort(capabilityKey, 'asc')}
                >
                  <ChevronUpIcon />
                </button>
                <button
                  type="button"
                  class="bits-user-capability-matrix__sort-btn"
                  class:bits-user-capability-matrix__sort-btn--active={sortKey ===
                    capabilityKey && sortDirection === 'desc'}
                  aria-label={`Sort by ${capabilityLabelByKey[capabilityKey] ?? capabilityKey} with disabled first`}
                  onclick={() => setSort(capabilityKey, 'desc')}
                >
                  <ChevronDownIcon />
                </button>
              </span>
            </div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sortedRows as row (row.userId)}
        <tr class="border-t border-primary/25">
          <th class="bits-user-capability-matrix__user-cell" scope="row">
            <span
              class="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold max-w-80"
              >{row.name}</span
            >
            <span class="block text-xxs uppercase tracking-wide text-neutral-content/80"
              >{row.role}</span
            >
          </th>
          {#each capabilityKeys as capabilityKey (capabilityKey)}
            <td class="bits-user-capability-matrix__cell">
              <Checkbox
                checked={row.capabilities?.[capabilityKey] === true}
                disabled={!isEditing}
                onCheckedChange={value =>
                  onToggleCell({
                    userId: row.userId,
                    capabilityKey,
                    value,
                  })}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
