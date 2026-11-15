<script lang="ts">
// API
import { reviewSystemTask } from '#lib/api/systemTasks.remote.js'
// TYPES
import type { SystemTask } from '#lib/tasks.system.js'

let { tasks, onreview }: { tasks: SystemTask[]; onreview: () => Promise<unknown> } =
  $props()
let pending = $state<string | null>(null)
let failure = $state('')

/** Acknowledge a system issue and refresh the shared task count.
 * @param task Current issue. @param outcome Review result. @returns Completion after queue refresh.
 */
async function review(
  task: SystemTask,
  outcome: 'accepted' | 'rejected',
): Promise<void> {
  pending = task.id
  failure = ''
  try {
    await reviewSystemTask({
      id: task.id,
      expectedModifiedAt: task.modifiedAt,
      outcome,
      meta: { isAdminRequest: true },
    })
    await onreview()
  } catch {
    failure = 'Could not review this task. Refresh and try again.'
  } finally {
    pending = null
  }
}
</script>

{#if tasks.length}
  <div class="px-3">
    {#if failure}
      <p role="alert">{failure}</p>
    {/if}
    {#each tasks as task (task.id)}
      <article class="border-border border-b py-4" aria-busy={pending === task.id}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-medium">{task.title}</h3>
          <span class="text-muted-foreground text-sm"
            >{task.resource === 'premisesMap' ? 'Premises map' : 'Location'}</span
          >
        </div>
        <p class="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
          {task.message}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <a
            class="underline"
            href={task.resource === 'premisesMap'
              ? `/admin/premises-maps?map=${encodeURIComponent(task.resourceId)}`
              : `/admin/locations/${encodeURIComponent(task.resourceId)}`}
            >Open {task.resource === 'premisesMap' ? 'map editor' : 'location'}</a
          >
          {#if task.isReviewed}
            <span>{task.reviewOutcome === 'accepted' ? 'Accepted' : 'Rejected'}</span>
          {:else}
            <button
              type="button"
              class="underline"
              disabled={pending !== null}
              onclick={() => review(task, 'accepted')}
            >
              Mark reviewed · Accept
            </button>
            <button
              type="button"
              class="underline"
              disabled={pending !== null}
              onclick={() => review(task, 'rejected')}
            >
              Mark reviewed · Reject
            </button>
          {/if}
        </div>
      </article>
    {/each}
  </div>
{/if}
