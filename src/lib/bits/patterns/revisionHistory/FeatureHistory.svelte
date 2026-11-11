<script lang="ts">
// SVELTE
import { getContext, onDestroy, untrack } from 'svelte'
// CONTEXT
import { HEADER_CTRL_KEY, type HeaderCtrl } from '#lib/context/header.svelte.js'
// ICONS
import RefreshIcon from 'virtual:icons/proicons/arrow-sync'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import CollapseIcon from 'virtual:icons/proicons/full-screen-minimize'
// API
import {
  getFeatureRevisionWorkspace,
  getFeaturePublicationReview,
  getFeaturePrivateReview,
} from '#lib/api/featureRevisions.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import FeaturePublicationHistory from './FeaturePublicationHistory.svelte'
import HistoryFilters from './HistoryFilters.svelte'
import { featureHistoryFilterEntry } from '#lib/revisions/historyFilters.js'
// TYPES
import type { FeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'

let {
  featureId,
  taskId,
  refreshVersion = 0,
}: {
  featureId: string
  taskId?: string
  refreshVersion?: number
} = $props()
type Workspace = FeatureRevisionWorkspace & {
  canPublish: boolean
  fields: ('title' | 'description')[]
}
const headerCtrl = getContext<HeaderCtrl | undefined>(HEADER_CTRL_KEY)
let expandAll = $state(true)
let workspace = $state<Workspace | null>(null)
let busy = $state(false)
let message = $state('')
let loadedFor = ''
let loadSequence = 0

// Both publication groups follow the same toolbar disclosure command.
$effect(() => {
  headerCtrl?.setViewActions([
    {
      text: 'Refresh',
      id: 'history-refresh',
      icon: RefreshIcon,
      alwaysHideLabel: true,
      iconClass: busy ? 'motion-safe:animate-spin' : '',
      attrs: { 'aria-busy': busy },
      onClick: () => {
        void run(load)
      },
    },
    {
      id: 'history-expand',
      text: expandAll ? 'Collapse all' : 'Expand all',
      icon: expandAll ? CollapseIcon : ExpandIcon,
      alwaysHideLabel: true,
      disabled: !workspace,
      attrs: { 'aria-expanded': !!expandAll },
      onClick: () => {
        expandAll = !expandAll
      },
    },
  ])
})
onDestroy(() => headerCtrl?.setViewActions([]))

/** Refresh only this Feature's bounded, authorized workspace. */
async function load(): Promise<void> {
  const requestedId = featureId
  const sequence = ++loadSequence
  const result = await refreshRemoteQuery(
    getFeatureRevisionWorkspace({
      featureId: requestedId,
      taskId,
      meta: { isAdminRequest: true },
    }),
  )
  if (featureId !== requestedId || sequence !== loadSequence) return
  workspace = result
}

/** Keep failures in this panel and prevent duplicate commands while one is pending. */
async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return
  busy = true
  message = ''
  try {
    await action()
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Unable to complete this change.'
  } finally {
    busy = false
  }
}

// Refresh read-only history when the selected Feature or its saved revision changes.
$effect(() => {
  const requestedId = featureId
  refreshVersion
  untrack(() => {
    if (loadedFor !== requestedId) {
      loadedFor = requestedId
      workspace = null
      message = ''
    }
    void load()
      .then(() => {})
      .catch(cause => {
        if (featureId === requestedId)
          message =
            cause instanceof Error ? cause.message : 'Could not load Feature revisions'
      })
  })
})
</script>

<section
  class="w-full min-w-0 space-y-4 pb-12"
  aria-label="Feature revisions"
  data-history-surface
>
  <HistoryFilters
    entries={[
      ...(workspace?.history ?? []).map(entry => featureHistoryFilterEntry(entry)),
      ...(workspace?.privateHistory ?? []).map((entry, index) =>
        featureHistoryFilterEntry(
          { ...entry, generation: -index - 1 },
          undefined,
          true,
        ),
      ),
    ]}
    loading={!workspace}
  />
  {#if message}
    <p role="status" class="text-sm break-words whitespace-normal">{message}</p>
  {/if}
  {#if workspace && !workspace.enabled}
    <p class="text-muted-foreground text-sm">
      Revision recording is not enabled for this Feature yet.
    </p>
  {:else if workspace?.enabled}
    {#if workspace.state !== 'active'}
      <p class="text-muted-foreground text-sm">
        This Feature was
        {workspace.state === 'merged'
          ? 'merged into another Feature'
          : 'split into successor Features'}. Its earlier publications remain available
        below.
      </p>
    {:else if workspace.initialContribution}
      <p class="text-muted-foreground text-sm">
        This new Feature and its photos are reviewed together in the task queue.
      </p>
      {#if workspace.initialTaskId}
        <a
          class="text-sm underline"
          href={`/admin/tasks/${encodeURIComponent(workspace.initialTaskId)}`}
          >Open contribution task</a
        >
      {/if}
    {/if}
    {#key workspace}
      {#if workspace.privateHistory?.length}
        <FeaturePublicationHistory
          {expandAll}
          label="Changes recorded while unpublished"
          privateHistory
          entries={workspace.privateHistory.map((entry, index) => ({
            ...entry,
            generation: -index - 1,
          }))}
          canReview={workspace.canPublish}
          loadReview={entry =>
            getFeaturePrivateReview({
              featureId,
              revisionId: entry.revisionId!,
              meta: { isAdminRequest: true },
            })}
        />
      {/if}
      <FeaturePublicationHistory
        {expandAll}
        entries={workspace.history}
        canReview={workspace.canPublish}
        loadReview={entry =>
          getFeaturePublicationReview({
            featureId,
            generation: entry.generation,
            meta: { isAdminRequest: true },
          })}
      />
    {/key}
  {/if}
</section>
