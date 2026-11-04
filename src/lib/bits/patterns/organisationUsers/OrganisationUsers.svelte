<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import { searchUsers } from '#lib/api/user.remote.js'
import { runRemoteQuery, refreshRemoteQuery } from '#lib/remote/index.js'
// BITS
import UserDirectory from '#lib/bits/patterns/userDirectory/UserDirectory.svelte'
import UserDirectoryControls from '#lib/bits/patterns/userDirectory/UserDirectoryControls.svelte'
// TYPES
import type { DirectoryUser } from '#lib/bits/patterns/userDirectory/userDirectory.types.js'

let { organisationId }: { organisationId: string } = $props()
let query = $state('')
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
    conditions: { isArchived: archived, hasEmail, hasTelephone },
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
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="border-border flex flex-wrap items-center gap-3 border-b p-4">
    <input
      type="search"
      aria-label="Search organisation users"
      placeholder="Search users"
      bind:value={query}
      oninput={() => void load()}
      class="border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2"
    >
    <UserDirectoryControls
      count={totalCount}
      {archived}
      {hasEmail}
      {hasTelephone}
      {sorting}
      onArchivedChange={value => {
        archived = value
        void load()
      }}
      onHasEmailChange={value => {
        hasEmail = value
        void load()
      }}
      onHasTelephoneChange={value => {
        hasTelephone = value
        void load()
      }}
      onSortingChange={value => {
        sorting = value as typeof sorting
        void load()
      }}
      onReset={() => {
        archived = false
        hasEmail = null
        hasTelephone = null
        query = ''
        sorting = { sortBy: 'name', sortOrder: 'asc' }
        void load()
      }}
    />
  </div>
  <UserDirectory
    {users}
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
