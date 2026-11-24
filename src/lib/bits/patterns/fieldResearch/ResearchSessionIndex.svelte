<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { getLocale } from '#lib/i18n.js'
// BITS COMPONENTS
import { cx } from '#lib/bits/utils.js'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
import { getRowRootClass } from '#lib/bits/custom/rows/row.styles.js'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
// API
import { getResearchSessions } from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'

let {
  indexPath,
  archive,
  sorting,
  count = $bindable(0),
}: {
  indexPath: string
  archive: 'active' | 'archived' | 'all'
  sorting: { sortBy: 'createdAt' | 'name'; sortOrder: 'asc' | 'desc' }
  count?: number
} = $props()

const options = $derived({ archive, ...sorting })
let sessions = $state<Awaited<ReturnType<typeof getResearchSessions>>>([])
let loading = $state(false)
let ready = $state(false)
let failure = $state('')
let hasMore = $state(false)
let generation = 0
const updatedFormat = $derived(
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
)

// Every desktop row and its heading use the same tracks, independent of their content.
const columns =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-x-3 gap-y-2 px-4 @min-[44rem]/sessions:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_10rem]'
const rowClass = getRowRootClass({ className: cx(columns, 'min-h-18 py-3') })

/** Fetch the first or next page, ignoring responses from a previous sort or filter.
 * @param before Last displayed session when appending.
 * @returns Once the current page has been applied or its error displayed.
 */
async function load(before?: string): Promise<void> {
  const request = generation
  loading = true
  failure = ''
  try {
    const rows = await refreshRemoteQuery(getResearchSessions({ ...options, before }))
    if (request !== generation) return
    sessions = before ? [...sessions, ...rows] : rows
    if (!before) count = rows[0]?.totalCount ?? 0
    hasMore = rows.length < (rows[0]?.totalCount ?? 0)
  } catch (error) {
    if (request === generation)
      failure = error instanceof Error ? error.message : String(error)
  } finally {
    if (request === generation) {
      loading = false
      ready = true
    }
  }
}

$effect(() => {
  options
  sessions = []
  count = 0
  ready = false
  hasMore = false
  untrack(() => void load())
  return () => {
    generation++
  }
})
</script>

<section
  aria-label="Field sessions"
  class="@container/sessions flex min-h-0 min-w-0 flex-1 flex-col"
>
  {#if failure}
    <p class="text-error mx-5 my-3" role="alert">
      {failure}
      <button
        type="button"
        class="ml-2 underline"
        onclick={() => void load(sessions.at(-1)?.id)}
      >
        Retry
      </button>
    </p>
  {/if}
  {#if !failure || sessions.length}
    <div
      aria-hidden="true"
      class={cx(
        columns,
        'text-muted-foreground mx-5 hidden pt-4 text-xs font-medium @min-[44rem]/sessions:grid',
      )}
    >
      <span>Session</span><span>Records</span><span>Created by</span
      ><span>Last updated</span>
    </div>
    <ResourceIndex
      entities={sessions}
      isInitialised={ready}
      hasMore={hasMore && !failure}
      isLoadingMore={loading}
      onNearEnd={() => void load(sessions.at(-1)?.id)}
    >
      {#snippet row(session)}
        {@const creator = session.creatorName || session.createdBy}
        <a
          class={rowClass}
          href={`${indexPath}?session=${encodeURIComponent(session.id)}`}
        >
          <span class="min-w-0 break-words whitespace-normal">
            <span class="block font-semibold">{session.name}</span>
            <span class="text-muted-foreground block text-sm"
              >{session.projectName || session.projectId}</span
            >
          </span>
          <span class="text-sm tabular-nums"
            >{session.recordCount}<span class="@min-[44rem]/sessions:sr-only">
              {session.recordCount === 1 ? 'record' : 'records'}</span
            ></span
          >
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <span aria-hidden="true" class="flex shrink-0"
              ><Avatar
                class="size-6!"
                src={session.creatorImage}
                name={creator}
              /></span
            >
            <span class="min-w-0 break-words"
              ><span class="sr-only">Created by </span>{creator}</span
            >
          </span>
          <span class="text-muted-foreground min-w-0 text-sm">
            <span class="sr-only">Last updated </span
            ><time datetime={session.updatedAt}
              >{updatedFormat.format(new Date(session.updatedAt))}</time
            >
          </span>
        </a>
      {/snippet}
    </ResourceIndex>
  {/if}
</section>
