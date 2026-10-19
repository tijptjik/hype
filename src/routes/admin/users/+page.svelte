<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import { searchUsers } from '#lib/api/user.remote.js'
import { refreshRemoteQuery, runRemoteQuery } from '#lib/remote/index.js'
// BITS
import UserDirectoryControls from '#lib/bits/patterns/userDirectory/UserDirectoryControls.svelte'
import UserDirectory from '#lib/bits/patterns/userDirectory/UserDirectory.svelte'
// ICONS
import UsersIcon from 'virtual:icons/proicons/person-multiple'
// TYPES
import type { DirectoryUser } from '#lib/bits/patterns/userDirectory/userDirectory.types.js'

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setResourceType(false)
let archived = $state<boolean | null>(false)
let hasEmail = $state<boolean | null>(null)
let hasTelephone = $state<boolean | null>(null)
let sorting = $state<{
  sortBy: 'name' | 'email' | 'createdAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}>({ sortBy: 'name', sortOrder: 'asc' })

let users = $state<DirectoryUser[]>([])
let totalCount = $state(0)
let nextOffset = $state(0)
let hasMore = $state(false)
let retryOffset = $state(0)
let resetVersion = $state(0)
let query = $state('')
let loading = $state(true)
let hasLoaded = $state(false)
let failed = $state(false)
let requestVersion = 0

/**
 * Loads a server-filtered page using the same endpoint as member selection.
 * @param pageOffset Zero-based offset into the matching users.
 * @param refresh Whether to retry a cached failed remote query.
 * @returns Completion after the newest request is reflected in the list.
 * @remarks Late responses from superseded searches are ignored.
 */
async function loadUsers(pageOffset = 0, refresh = false): Promise<void> {
  retryOffset = pageOffset
  const version = ++requestVersion
  loading = true
  failed = false
  try {
    const result = await (refresh ? refreshRemoteQuery : runRemoteQuery)(
      searchUsers({
        q: query,
        directory: true,
        pagination: { limit: 25, offset: pageOffset },
        sorting,
        conditions: { isArchived: archived, hasEmail, hasTelephone },
      }),
    )
    if (version !== requestVersion) return
    hasLoaded = true
    users =
      pageOffset === 0
        ? result.data
        : [...new Map([...users, ...result.data].map(user => [user.id, user])).values()]
    totalCount = result.totalCount
    nextOffset = result.offset + result.data.length
    hasMore = result.data.length > 0 && nextOffset < totalCount
    if (pageOffset === 0) resetVersion++
  } catch {
    if (version === requestVersion) failed = true
  } finally {
    if (version === requestVersion) loading = false
  }
}

/** Loads the next page without replacing settled rows.
 * @returns Nothing when already loading, failed, or at the end.
 */
function loadMore(): void {
  if (loading || failed || !hasLoaded || !hasMore) return
  void loadUsers(nextOffset)
}

/**
 * Applies the shared sort control and restarts paging.
 * @param value Requested sort field and direction.
 * @returns Nothing.
 */
function changeSorting(value: { sortBy: string; sortOrder: 'asc' | 'desc' }): void {
  if (!['name', 'email', 'createdAt', 'updatedAt'].includes(value.sortBy)) return
  sorting = { ...value, sortBy: value.sortBy as typeof sorting.sortBy }
  void loadUsers()
}

/** @returns Nothing after restoring the initial directory filters and sort. */
function resetControls(): void {
  archived = false
  hasEmail = null
  hasTelephone = null
  sorting = { sortBy: 'name', sortOrder: 'asc' }
  void loadUsers()
}

$effect(() => {
  headerCtrl.setHeaderForIndex('Users', UsersIcon, {
    showNew: false,
    showFilter: true,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  headerCtrl.clearFooter()
})

$effect(() => {
  headerCtrl.setSearch({
    query,
    placeholder: 'Search users',
    onFilter: value => {
      query = value.trim()
      void loadUsers()
    },
  })
})

$effect(() => {
  headerCtrl.setControlBar(
    UserDirectoryControls,
    {
      count: totalCount,
      archived,
      hasEmail,
      hasTelephone,
      onHasEmailChange: (value: boolean | null) => {
        hasEmail = value
        void loadUsers()
      },
      onHasTelephoneChange: (value: boolean | null) => {
        hasTelephone = value
        void loadUsers()
      },
      sorting,
      onArchivedChange: (value: boolean | null) => {
        archived = value
        void loadUsers()
      },
      onSortingChange: changeSorting,
      onReset: resetControls,
    },
    { isVisible: true },
  )
})

onMount(() => {
  void loadUsers()
  return () => {
    requestVersion++
    headerCtrl.setSearch(null)
    headerCtrl.clearControlBar()
  }
})
</script>

<svelte:head><title>Users · HYPE</title></svelte:head>

<UserDirectory
  {users}
  {totalCount}
  {resetVersion}
  {hasMore}
  {loading}
  {hasLoaded}
  {failed}
  showSummary={false}
  onLoadMore={loadMore}
  onRetry={() => void loadUsers(retryOffset, true)}
/>
