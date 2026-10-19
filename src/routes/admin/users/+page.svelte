<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import { searchUsers } from '#lib/api/user.remote.js'
import { runRemoteQuery } from '#lib/remote/index.js'
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
let offset = $state(0)
let query = $state('')
let loading = $state(true)
let hasLoaded = $state(false)
let failed = $state(false)
let requestVersion = 0

/**
 * Loads a server-filtered page using the same endpoint as member selection.
 * @param nextOffset Zero-based offset into the matching users.
 * @returns Completion after the newest request is reflected in the list.
 * @remarks Late responses from superseded searches are ignored.
 */
async function loadUsers(nextOffset = 0): Promise<void> {
  const version = ++requestVersion
  loading = true
  failed = false
  try {
    const result = await runRemoteQuery(
      searchUsers({
        q: query,
        directory: true,
        pagination: { limit: 25, offset: nextOffset },
        sorting,
        conditions: { isArchived: archived, hasEmail, hasTelephone },
      }),
    )
    if (version !== requestVersion) return
    hasLoaded = true
    users = result.data
    totalCount = result.totalCount
    offset = result.offset
  } catch {
    if (version === requestVersion) failed = true
  } finally {
    if (version === requestVersion) loading = false
  }
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
  {offset}
  {loading}
  {hasLoaded}
  {failed}
  showSummary={false}
  onPrevious={() => void loadUsers(Math.max(0, offset - 25))}
  onNext={() => void loadUsers(offset + 25)}
  onRetry={() => void loadUsers(offset)}
/>
