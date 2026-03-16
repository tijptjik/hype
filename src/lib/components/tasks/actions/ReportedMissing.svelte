<script lang="ts">
import type { Component } from 'svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// i18n
import { m } from '$lib/i18n'
// COMPONENTS
import Trash from 'virtual:icons/lucide/trash-2'
import EyeSlash from 'virtual:icons/lucide/eye-off'
import XCircle from 'virtual:icons/lucide/circle-x'
import CubeTransparent from 'virtual:icons/lucide/ghost'
import Info from '$lib/components/forms/extra/Info.svelte'
import ReportedMissingContent from '$lib/components/tasks/info/ReportedMissing.svelte'
import Actions from '$lib/components/tasks/common/Actions.svelte'
// SERVICES
import { updateTaskReview, updateFeatureFromTask } from '$lib/client/services/task'
// NAVIGATION
import { goToNextTask } from '$lib/navigation'
// TYPES
import type { Task } from '$lib/types'

// STATE :: PROPS
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
    label: m.awful_this_dingo_glow(),
    icon: CubeTransparent as Component,
    action: 'setIntangible',
    onHoverClass: 'text-rose-300',
  },
  {
    label: m.forms__unpublish(),
    icon: EyeSlash as Component,
    action: 'setUnpublished',
    onHoverClass: 'text-rose-300',
  },
  {
    label: m.whole_deft_penguin_enchant(),
    icon: Trash as Component,
    action: 'setArchived',
    onHoverClass: 'text-rose-300',
  },
]

// CONTEXT :: ROUTER
const adminCtx = getAdminCtx()

// ACTIONS
const handleAction = async (action: string, e: Event, reviewReason?: string) => {
  e.preventDefault()
  try {
    if (action === 'reject') {
      // Simple rejection - just update the task
      await updateTaskReview(task.id, {
        type: 'reportedMissing',
        reviewOutcome: 'rejected',
        reviewAction: 'ignored',
        reviewReason,
      })
    } else {
      // Accept with specific action - update feature first, then task
      let changeSet: Record<string, unknown> = {}
      let reviewAction: string

      switch (action) {
        case 'setArchived':
          changeSet.isArchived = true
          changeSet.isPublished = false
          changeSet.isVisitable = false
          reviewAction = 'set-archived'
          break
        case 'setUnpublished':
          changeSet.isPublished = false
          changeSet.isVisitable = false
          reviewAction = 'set-unpublished'
          break
        case 'setIntangible':
          changeSet.isIntangible = true
          reviewAction = 'set-intangible'
          break
        default:
          throw new Error(`Unknown action: ${action}`)
      }

      // Update feature first
      if (task.feature?.id) {
        await updateFeatureFromTask(task.feature.id, changeSet)
      }

      // Update task - image handling is done in the PATCH endpoint
      const response = await updateTaskReview(task.id, {
        type: 'reportedMissing',
        reviewOutcome: 'accepted',
        reviewAction,
        reviewReason,
      })

      // Update the task cache
      adminCtx.appCtx.setTaskResourceAndCache(await response.json())
    }

    goToNextTask(adminCtx)
  } catch (error) {
    console.error('Failed to set task state:', error)
  }
}
</script>

<div class="flex items-center gap-4">
  <Actions {task} {rejectActions} {acceptActions} onAction={handleAction} />
  <Info> <ReportedMissingContent /> </Info>
</div>
