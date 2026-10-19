<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import Person from 'virtual:icons/proicons/person'
// TYPES
import type { DirectoryUser } from './userDirectory.types'
let {
  users,
  showSummary = true,
  totalCount,
  hasMore = false,
  resetVersion = 0,
  loading,
  hasLoaded = false,
  failed,
  onLoadMore,
  onRetry,
}: {
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
</script>

<section
  class="flex min-h-0 flex-1 flex-col"
  aria-label="User directory"
  aria-busy={loading}
>
  {#if showSummary}
    <div
      class="flex min-h-14 items-center justify-between gap-4 border-b border-border bg-panel px-6 py-3"
    >
      <p class="text-sm text-base-content/70">User profiles</p>
      <p class="shrink-0 text-sm font-semibold" role="status">
        {#if loading && !hasLoaded}
          Loading users…
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
        class="rounded-lg border border-border bg-panel p-8 text-center"
        role="alert"
      >
        <p>Unable to load users.</p>
        <button
          type="button"
          class="mt-3 rounded-lg border border-border px-4 py-2"
          onclick={onRetry}
        >
          Try again
        </button>
      </div>
    {/if}
    {#if loading && !hasLoaded}
      <div
        class="rounded-lg bg-panel p-8 text-center text-base-content/60"
        role="status"
      >
        Loading users…
      </div>
    {:else if hasLoaded}
      {#if users.length === 0}
        <div class="rounded-lg border border-border bg-panel p-8 text-center">
          No users found. Try another name, username or email.
        </div>
      {/if}
      <ul class="flex flex-col gap-1.5" aria-label="Users">
        {#each users as user (user.id)}
          <li
            animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}
            transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
            class="grid min-h-20 grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 rounded-lg border border-border bg-panel p-2 shadow-sm lg:grid-cols-[4rem_minmax(12rem,1fr)_minmax(10rem,0.7fr)]"
          >
            <div
              class="row-span-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-base-200 lg:row-span-2"
            >
              {#if typeof user.image === 'string' && user.image}
                <img
                  src={user.image}
                  alt=""
                  class="h-full w-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                >
              {:else}
                <Person class="h-8 w-8 text-base-content/45" />
              {/if}
            </div>
            <div class="min-w-0">
              <p class="truncate font-semibold">
                {user.name || user.displayUsername || user.username || 'Unnamed user'}
              </p>
              <p class="truncate text-sm text-base-content/65">
                {#if user.username}
                  <a
                    class="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-primary"
                    href={`/admin/users/${encodeURIComponent(user.username)}`}
                    >@{user.displayUsername || user.username}</a
                  >
                {:else}
                  No username
                {/if}
              </p>
            </div>
            <p
              class="truncate text-sm text-base-content/60"
              title={user.attribution ?? undefined}
            >
              {user.attribution || 'No attribution'}
            </p>
            <div
              class="col-start-2 flex flex-wrap gap-x-4 gap-y-1 pb-1 text-xs text-base-content/60 lg:col-span-2 lg:col-start-2"
            >
              {#if user.email}
                <span>{user.email}</span>
              {/if}
              {#if user.telephone}
                <span>{user.telephone}</span>
              {/if}
              <span>{user.locale || 'en'}</span>
              <span>{user.isArchived ? 'Archived' : 'Active'}</span>
              {#if user.createdAt}
                <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
              {/if}
            </div>
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
          class="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? 'Loading more users…' : 'Load more users'}
        </button>
      </div>
    {/if}
  </div>
</section>
