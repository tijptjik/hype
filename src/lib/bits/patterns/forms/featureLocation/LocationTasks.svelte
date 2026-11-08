<script lang="ts">
// SVELTE
import { page } from '$app/state'
// I18N
import { m } from '#lib/i18n.js'
// API
import { getTasks } from '#lib/api/tasks.remote.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// COMPONENTS
import TaskRow from '#lib/bits/patterns/resource/rows/TaskRow/TaskRow.svelte'
import FormDisclosureGroup from '../formDisclosureGroup/FormDisclosureGroup.svelte'
// TYPES
import type { Task } from '#lib/db/zod/schema/task.types.js'

let { featureId, refreshKey }: { featureId: string; refreshKey?: string } = $props()
const adminCtx = getAdminCtx()
let tasks = $state<Task[]>([])
let count = $state(0)
let collapsed = $state(false)
$effect(() => {
  const id = featureId
  const revision = refreshKey
  const mock =
    import.meta.env.DEV && page.url.searchParams.has('locationTaskPreview')
      ? id
      : undefined
  const request = getTasks({
    conditions: { featureId: id, isReviewed: false },
    locationOnly: true,
    mockLocationFeatureId: mock,
    meta: { isAdminRequest: true, profile: 'admin' },
    pagination: { limit: 20 },
  })
  let cancelled = false
  // The shared queue determines relevance and scope; opening this editor never manufactures a task.
  void Promise.resolve(revision)
    .then(() => request.refresh())
    .then(() => request)
    .then(result => {
      if (cancelled) return
      tasks = result.data as Task[]
      count = result.totalCount ?? tasks.length
    })
    .catch(() => {
      if (!cancelled) {
        tasks = []
        count = 0
      }
    })
  return () => {
    cancelled = true
  }
})
</script>

{#if count > 0}
  <FormDisclosureGroup
    title={m.location_review_title()}
    count={String(count)}
    {collapsed}
    onCollapsedChange={value => (collapsed = value)}
  >
    <div class="min-w-0 overflow-hidden py-2">
      {#each tasks as entity, index (entity.id)}
        <TaskRow {entity} {index} {adminCtx} />
      {/each}
    </div>
  </FormDisclosureGroup>
{/if}
