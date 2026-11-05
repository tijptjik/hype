<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// API
import { searchUsers } from '#lib/api/user.remote.js'
import { runRemoteQuery, refreshRemoteQuery } from '#lib/remote/index.js'
// BITS
import UserDirectory from '#lib/bits/patterns/userDirectory/UserDirectory.svelte'
import UserDirectoryControls from '#lib/bits/patterns/userDirectory/UserDirectoryControls.svelte'
// TYPES
import type {
  DirectoryUser,
  DirectoryFilters,
  DirectoryJoinedRange,
} from '#lib/bits/patterns/userDirectory/userDirectory.types.js'

const headerCtrl = getHeaderCtrl()
const adminCtx = getAdminCtx()
const resourceType = FirstClassResource.user

let { organisationId }: { organisationId: string } = $props()
let query = $state('')
let filters = $state<DirectoryFilters>({})
let joinedRange = $state<DirectoryJoinedRange | null>(null)
let archived = $state<boolean | null>(false)
let hasEmail = $state<boolean | null>(null)
let hasTelephone = $state<boolean | null>(null)
let sorting = $state<{
  sortBy: 'name' | 'email' | 'createdAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}>({ sortBy: 'name', sortOrder: 'asc' })
let users = $state<DirectoryUser[]>([])
let totalCount = $state(0)
let loading = $state(true)
let failed = $state(false)
let hasLoaded = $state(false)
let hasMore = $state(false)
let nextOffset = $state(0)
let retryOffset = $state(0)
let resetVersion = $state(0)
let generation = 0

/** Load a server-scoped page while retaining settled rows during replacement.
 * @param offset Requested offset.
 * @param refresh Whether to retry a failed cached query.
 * @returns Completion of the latest page request.
 */
async function load(offset = 0, refresh = false): Promise<void> {
  const request = ++generation
  const params = {
    organisationId,
    directory: true,
    q: query,
    pagination: { limit: 25, offset },
    sorting,
    conditions: { ...filters, isArchived: archived, hasEmail, hasTelephone },
  }
  retryOffset = offset
  loading = true
  failed = false
  try {
    const result = await (refresh ? refreshRemoteQuery : runRemoteQuery)(
      searchUsers(params),
    )
    if (request !== generation) return
    users = offset
      ? [...new Map([...users, ...result.data].map(row => [row.id, row])).values()]
      : result.data
    totalCount = result.totalCount
    // Retain the initial audience range so filtering never moves the slider's endpoints.
    if (!joinedRange && result.joinedRange) joinedRange = result.joinedRange
    nextOffset = result.offset + result.data.length
    hasMore = result.data.length > 0 && nextOffset < totalCount
    hasLoaded = true
    if (!offset) resetVersion++
  } catch {
    if (request === generation) failed = true
  } finally {
    if (request === generation) loading = false
  }
}

$effect(() => {
  organisationId
  untrack(() => void load())
  return () => {
    generation++
  }
})
// Keep the directory controls in the same header slots as resource indexes.
$effect(() => {
  headerCtrl.setSearch({
    indexView: true,
    query,
    placeholder: 'Search users',
    onFilter: value => {
      query = value.trim()
      void load()
    },
  })
})

$effect(() => {
  headerCtrl.setControlBar(
    UserDirectoryControls,
    {
      count: totalCount,
      filters,
      joinedRange,
      onFiltersChange: (value: DirectoryFilters) => {
        filters = value
        void load()
      },
      archived,
      hasEmail,
      hasTelephone,
      sorting,
      onArchivedChange: (value: boolean | null) => {
        archived = value
        void load()
      },
      onHasEmailChange: (value: boolean | null) => {
        hasEmail = value
        void load()
      },
      onHasTelephoneChange: (value: boolean | null) => {
        hasTelephone = value
        void load()
      },
      onSortingChange: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) => {
        if (!['name', 'email', 'createdAt', 'updatedAt'].includes(value.sortBy)) return
        sorting = { ...value, sortBy: value.sortBy as typeof sorting.sortBy }
        void load()
      },
      onReset: () => {
        filters = {}
        archived = false
        hasEmail = null
        hasTelephone = null
        query = ''
        sorting = { sortBy: 'name', sortOrder: 'asc' }
        void load()
      },
    },
    { isVisible: adminCtx.listUi.state.isControlBarVisible[resourceType] },
  )
})

onDestroy(() => {
  headerCtrl.setSearch(null)
  headerCtrl.clearControlBar()
})
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <UserDirectory
    {users}
    showSummary={false}
    layout={adminCtx.listUi.state.layoutMode[resourceType] === 'card' ? 'card' : 'list'}
    {totalCount}
    {loading}
    {failed}
    {hasLoaded}
    {hasMore}
    {resetVersion}
    onLoadMore={() => {
      if (!loading && !failed && hasMore) void load(nextOffset)
    }}
    onRetry={() => void load(retryOffset, true)}
  />
</div>
