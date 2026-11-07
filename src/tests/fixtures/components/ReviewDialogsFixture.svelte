<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
// ICONS
import DuplicateIcon from 'virtual:icons/lucide/circle-equal'
// COMPONENTS
import FeatureIdentityDialog from '#lib/bits/patterns/revisionHistory/FeatureIdentityDialog.svelte'
import TaskRejectDialog from '#lib/bits/patterns/tasks/components/TaskRejectDialog.svelte'

const responsive = setResponsiveCtx()
setRootCTX(responsive)
const view = setSurfaceCtx(
  new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    responsive,
    undefined,
    'admin',
  ),
)
onDestroy(() => view.dispose())
let reject = $state(false)
let duplicate = $state(false)
let reason = $state('')
let source = $state<HTMLElement | null>(null)
let rejected = $state(0)
</script>

<main class="bits-theme bg-surface text-foreground min-h-screen p-8">
  <div class="flex gap-4">
    <button
      type="button"
      class="border-border bg-panel rounded-lg border px-4 py-3"
      onclick={event => {
        source = event.currentTarget
        reject = true
      }}
    >
      Reject contribution
    </button>
    <button
      type="button"
      class="border-border bg-panel inline-flex items-center gap-2 rounded-lg border px-4 py-3"
      onclick={event => {
        source = event.currentTarget
        duplicate = true
      }}
    >
      <DuplicateIcon class="size-5" />Duplicate contribution
    </button>
  </div>
  <p class="mt-8" data-rejected>{rejected}</p>
  <p class="mt-8 text-3xl">
    Background evidence should stay behind an opaque review dialog.
  </p>
</main>
<TaskRejectDialog
  bind:open={reject}
  bind:value={reason}
  {source}
  onConfirm={() => {
    rejected++
    reject = false
  }}
/>
<FeatureIdentityDialog
  bind:open={duplicate}
  {source}
  kind="merge"
  featureId="candidate"
  layerId="layer"
  duplicateTaskId="task"
  creationProposal
  duplicateChoice
  onDiscard={async () => true}
  onApplied={async () => {}}
/>
