<script lang="ts">
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
import TaskImageReview from '#lib/bits/patterns/tasks/components/TaskImageReview.svelte'
const responsive = setResponsiveCtx()
setRootCTX(responsive)
setSurfaceCtx(
  new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    responsive,
    undefined,
    'admin',
  ),
)
setThemeModel()
const photoTask = new URLSearchParams(location.search).has('photo')
let acceptAction = $state<{
  disabled: boolean
  accept: (mode?: 'acceptAll' | 'acceptClassified') => Promise<void>
}>()
let accepted = $state(false)
let busy = $state(false)
let token = $state<string | null>(null)
</script>
<div
  data-review-busy={busy}
  data-review-token={token}
  class="flex h-dvh min-h-0 flex-col px-4 py-12"
>
  {#if photoTask}
    <header>
      <button
        type="button"
        disabled={!acceptAction || acceptAction.disabled}
        onclick={() => acceptAction?.accept('acceptAll')}
      >
        Accept All
      </button><button
        type="button"
        disabled={!acceptAction || acceptAction.disabled}
        onclick={() => acceptAction?.accept('acceptClassified')}
      >
        Accept Classified
      </button>
    </header>
  {/if}
  <span data-accepted={accepted}></span>
  <TaskImageReview
    pendingItemCount={new URLSearchParams(location.search).has('pending') ? 2 : 0}
    taskId="task"
    layout={new URLSearchParams(location.search).has('top') ? 'top' : undefined}
    initialReport={!photoTask}
    readonly={new URLSearchParams(location.search).has('outcome')}
    onAcceptActionChange={action => (acceptAction = action)}
    onAccepted={async () => {
      accepted = true
    }}
    onChange={(review, pending, waitForOrder) => {
      ;(globalThis as any).waitForImageOrder = waitForOrder
      busy = pending
      token = review?.reviewId ?? null
    }}
  />
</div>
