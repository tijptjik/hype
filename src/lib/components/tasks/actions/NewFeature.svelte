<script lang="ts">
import type { Component } from 'svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import XCircle from 'virtual:icons/lucide/circle-x'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import Info from '$lib/components/forms/extra/Info.svelte'
import NewFeatureContent from '$lib/components/tasks/info/NewFeature.svelte'
import Actions from '$lib/components/tasks/common/Actions.svelte'
// SERVICES
import { updateTaskReview, updateFeatureFromTask } from '$lib/client/services/task'
import { goToNextTask, navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Task } from '$lib/types'

let { task }: { task: Task } = $props()

// CONFIG
let rejectActions = [
  {
    label: m.quiet_late_worm_startle(),
    icon: XCircle as Component,
    action: 'reject',
    onHoverClass: 'text-rose-300',
  },
]

let acceptActions = [
  {
    label: m.quiet_late_worm_startle_accept(),
    icon: CheckCircle as Component,
    action: 'accept',
    onHoverClass: 'text-success',
  },
]

// CONTEXT :: ROUTER
const adminCtx = getAdminCtx()

// ACTIONS
const handleAction = async (action: string, e: Event, reviewReason?: string) => {
  e.preventDefault()
  try {
    let reviewOutcome: string
    let reviewAction: string

    switch (action) {
      case 'reject':
        reviewOutcome = 'rejected'
        reviewAction = 'ignored'
        break
      case 'accept':
        reviewOutcome = 'accepted'
        reviewAction = 'added-feature'
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    // Update the associated feature first if it exists
    if (task.featureId) {
      await updateFeatureFromTask(task.featureId, {
        isPendingReview: false,
        isArchived: action === 'reject',
      })
    }

    // Then update the task
    const response = await updateTaskReview(task.id, {
      type: 'newFeature',
      reviewOutcome,
      reviewAction,
      reviewReason,
    })

    // Update the task cache
    adminCtx.appCtx.setTaskResourceAndCache(await response.json())

    if (action === 'accept') {
      navigateOnAdmin(adminCtx, FirstClassResource.feature, task.featureId)
    } else {
      goToNextTask(adminCtx)
    }
  } catch (error) {
    console.error(`Failed to ${action} task:`, error)
  }
}
</script>

<div class="flex items-center gap-4">
  <Actions {task} {rejectActions} {acceptActions} onAction={handleAction} />
  <Info borderColor="border-success"> <NewFeatureContent /> </Info>
</div>
