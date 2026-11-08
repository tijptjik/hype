<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  getFeatureRevisionWorkspace,
  getFeaturePublicationReview,
  getFeaturePrivateReview,
} from '#lib/api/featureRevisions.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import FeaturePublicationHistory from './FeaturePublicationHistory.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Header from '#lib/bits/custom/header/Header.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// ICONS
import HistoryIcon from 'virtual:icons/proicons/history'
// TYPES
import type { FeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'

let {
  featureId,
  taskId,
  isDirty = false,
  refreshVersion = 0,
}: {
  featureId: string
  taskId?: string
  isDirty?: boolean
  refreshVersion?: number
} = $props()
type Workspace = FeatureRevisionWorkspace & {
  canPublish: boolean
  fields: ('title' | 'description')[]
}
let workspace = $state<Workspace | null>(null)
let busy = $state(false)
let message = $state('')
let loadedFor = ''
const disabled = $derived(busy || isDirty)
let loadSequence = 0

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
  if (disabled) return
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

// Read-only hydration must still run while a successful form save is settling its dirty state.
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
      .then(() => {
      })
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
>
  <FormSurface class="mb-0!">
    <SectionHeader>
      {#snippet left()}
        <Header
          text="History"
          description="Changes to this feature · newest first"
          icon={HistoryIcon}
          size="sm"
          class="bits-form__section-header-heading w-auto! min-w-0"
        />
      {/snippet}
      {#snippet right()}
        <button
          type="button"
          class="border-border rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          {disabled}
          onclick={() => run(load)}
        >
          Refresh
        </button>
      {/snippet}
    </SectionHeader>
  </FormSurface>
  {#if message}
    <p role="status" class="text-sm break-words whitespace-normal">{message}</p>
  {/if}
  {#if isDirty}
    <p class="text-muted-foreground text-sm">
      Save or discard the open form changes before using revision actions.
    </p>
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
