<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { onDestroy } from 'svelte'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// API
import { getUserDirectoryMetrics } from '#lib/api/user.remote.js'
import { runRemoteQuery, refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import UserDirectoryRow from './UserDirectoryRow.svelte'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { DirectoryUser } from './userDirectory.types'
import type { UserDirectoryMetrics } from '#lib/users/directoryMetrics.types.js'
let {
  users,
  showSummary = true,
  layout = 'list',
  totalCount,
  hasMore = false,
  resetVersion = 0,
  loading,
  hasLoaded = false,
  failed,
  onLoadMore,
  onRetry,
}: {
  layout?: 'card' | 'list'
  showSummary?: boolean
  users: DirectoryUser[]
  totalCount: number
  hasMore?: boolean
  resetVersion?: number
  hasLoaded?: boolean
  loading: boolean
  failed: boolean
  onLoadMore: () => void
  onRetry: () => void
} = $props()
let viewport = $state<HTMLDivElement | null>(null)
let sentinel = $state<HTMLDivElement | null>(null)

$effect(() => {
  resetVersion
  if (viewport) viewport.scrollTop = 0
})

// Recheck after each settled page, including when the first page is shorter than the viewport.
$effect(() => {
  if (!viewport || !sentinel || !hasMore || loading || failed) return
  const observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore()
    },
    { root: viewport, rootMargin: '240px' },
  )
  observer.observe(sentinel)
  return () => observer.disconnect()
})
let listElement = $state<HTMLUListElement | null>(null)
let metrics = $state<Record<string, UserDirectoryMetrics>>({})
let metricFailures = $state<Record<string, boolean>>({})
const visible = new Set<string>()
const inFlight = new Set<string>()
let batchTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

/** Batch only uncached rows that are currently in the scroll viewport.
 * @returns Nothing; the short delay groups observer notifications into one request.
 */
function scheduleMetrics(): void {
  if (disposed || batchTimer) return
  batchTimer = setTimeout(() => {
    batchTimer = undefined
    const ids = [...visible]
      .filter(id => !metrics[id] && !metricFailures[id] && !inFlight.has(id))
      .slice(0, 25)
    if (ids.length) void loadMetrics(ids)
  }, 80)
}

/** Fetch public counters without replacing settled rows or showing failures as zero.
 * @param ids Bounded visible user IDs.
 * @param refresh Whether this is an explicit retry of a failed request.
 * @returns Completion after updating this mounted directory's cache.
 */
async function loadMetrics(ids: string[], refresh = false): Promise<void> {
  ids.forEach(id => {
    inFlight.add(id)
  })
  try {
    const result = await (refresh ? refreshRemoteQuery : runRemoteQuery)(
      getUserDirectoryMetrics({ userIds: ids }),
    )
    if (disposed) return
    const byId = new Map(result.map(row => [row.userId, row]))
    for (const id of ids) {
      const row = byId.get(id)
      if (row) metrics[id] = row
      metricFailures[id] = !row
    }
  } catch {
    if (!disposed)
      ids.forEach(id => {
        metricFailures[id] = true
      })
  } finally {
    ids.forEach(id => {
      inFlight.delete(id)
    })
    scheduleMetrics()
  }
}

// Observe the real scroll viewport, not every record returned by pagination.
$effect(() => {
  users
  if (!viewport || !listElement) return
  visible.clear()
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.userId
        if (!id) continue
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      scheduleMetrics()
    },
    { root: viewport },
  )
  listElement.querySelectorAll('[data-user-id]').forEach(row => {
    observer.observe(row)
  })
  return () => observer.disconnect()
})

onDestroy(() => {
  disposed = true
  clearTimeout(batchTimer)
})
</script>

<section
  class="flex min-h-0 flex-1 flex-col"
  aria-label="User directory"
  aria-busy={loading}
>
  {#if showSummary}
    <div
      class="border-border bg-panel flex min-h-14 items-center justify-between gap-4 border-b px-6 py-3"
    >
      <p class="text-base-content/70 text-sm">User profiles</p>
      <p class="shrink-0 text-sm font-semibold" role="status">
        {#if loading && !hasLoaded}
          <LoadingSkeleton label="Loading users…" text="0 users" />
        {:else}
          {totalCount.toLocaleString()}
          {totalCount === 1 ? 'user' : 'users'}
        {/if}
      </p>
    </div>
  {/if}
  <div bind:this={viewport} class="min-h-0 flex-1 overflow-y-auto p-3">
    {#if failed}
      <div
        class="border-border bg-panel rounded-lg border p-8 text-center"
        role="alert"
      >
        <p>Unable to load users.</p>
        <button
          type="button"
          class="border-border mt-3 rounded-lg border px-4 py-2"
          onclick={onRetry}
        >
          Try again
        </button>
      </div>
    {/if}
    {#if loading && !hasLoaded}
      <ContentSkeleton label="Loading users…">
        <ul
          class={layout === 'card'
            ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
            : 'flex flex-col gap-1.5'}
        >
          {#each Array(6) as _, index (index)}
            <li class="border-border bg-panel @container rounded-lg border shadow-sm">
              <UserDirectoryRow
                user={{
                  id: `pending-${index}`,
                  name: 'User name',
                  username: 'username',
                  displayUsername: 'username',
                  email: null,
                  attribution: null,
                  image: null,
                }}
                {layout}
                onRetry={() => {}}
              />
            </li>
          {/each}
        </ul>
      </ContentSkeleton>
    {:else if hasLoaded}
      {#if users.length === 0}
        <div class="border-border bg-panel rounded-lg border p-8 text-center">
          No users found. Try another name, username or email.
        </div>
      {/if}
      <ul
        bind:this={listElement}
        class={layout === 'card'
          ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
          : 'flex flex-col gap-1.5'}
        aria-label="Users"
      >
        {#each users as user (user.id)}
          <li
            animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}
            transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
            class="border-border bg-panel @container rounded-lg border shadow-sm"
            data-user-id={user.id}
          >
            <UserDirectoryRow
              {user}
              {layout}
              metrics={metrics[user.id]}
              metricsFailed={metricFailures[user.id]}
              onRetry={() => {
                metricFailures[user.id] = false
                void loadMetrics([user.id], true)
              }}
            />
          </li>
        {/each}
      </ul>
    {/if}
    <div bind:this={sentinel} class="h-px" aria-hidden="true"></div>
    {#if hasMore && hasLoaded}
      <div class="flex justify-center py-3">
        <button
          type="button"
          disabled={loading || failed}
          onclick={onLoadMore}
          class="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {#if loading}
            <LoadingSkeleton label={'Loading more users…'} text="Load more users" />
          {:else}
            {'Load more users'}
          {/if}
        </button>
      </div>
    {/if}
  </div>
</section>
