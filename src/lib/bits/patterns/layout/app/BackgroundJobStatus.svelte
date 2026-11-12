<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// SVELTEKIT
import { beforeNavigate } from '$app/navigation'
// TOASTS
import { toast } from 'svelte-sonner'
// TYPES
import type { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'

let { jobs }: { jobs: BackgroundJobs } = $props()

// Internal navigation preserves root-owned work; document departure requires a browser warning.
beforeNavigate(navigation => {
  if (navigation.willUnload && jobs.busy) navigation.cancel()
})

const renderedJobs = new Map<number, string>()

// Reuse one toast per job so progress becomes its outcome in the shared notification stack.
$effect(() => {
  for (const job of jobs.jobs) {
    const signature = JSON.stringify(job)
    if (renderedJobs.get(job.id) === signature) continue
    renderedJobs.set(job.id, signature)
    const running = job.status === 'running'
    const title = `${job.label}: ${job.completed}/${job.total}`
    const options = {
      id: `background-job-${job.id}`,
      duration: running || job.status !== 'complete' ? Infinity : 2500,
      dismissible: !running,
      closeButton: !running,
      onDismiss: () => jobs.dismiss(job.id),
      onAutoClose: () => jobs.dismiss(job.id),
    }
    // Sonner reads its own reactive state; only job changes should update the toast.
    untrack(() => {
      if (running) toast.info(title, options)
      else if (job.status === 'failed')
        toast.error('Could not finish. Some changes may have saved.', options)
      else if (job.status === 'stopped')
        toast.warning('Stopped because account permissions changed.', options)
      else if (job.errors)
        toast.warning(title, { ...options, description: `${job.errors} failed` })
      else toast.success(job.successMessage ?? title, options)
    })
  }
  for (const id of renderedJobs.keys()) {
    if (!jobs.jobs.some(job => job.id === id)) renderedJobs.delete(id)
  }
})
</script>
