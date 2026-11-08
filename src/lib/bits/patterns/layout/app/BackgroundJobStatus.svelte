<script lang="ts">
// SVELTEKIT
import { beforeNavigate } from '$app/navigation'
// TYPES
import type { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'

let { jobs }: { jobs: BackgroundJobs } = $props()

// Internal navigation preserves root-owned work; document departure requires a browser warning.
beforeNavigate(navigation => {
  if (navigation.willUnload && jobs.busy) navigation.cancel()
})
</script>

{#if jobs.jobs.length}
  <div
    class="fixed right-4 bottom-4 z-[1200] flex max-w-sm flex-col gap-2"
    aria-live="polite"
  >
    {#each jobs.jobs as job (job.id)}
      <div
        class="bg-background text-foreground rounded-lg border p-3 shadow-lg"
        role="status"
      >
        <div class="flex items-center gap-2">
          {#if job.status === 'running'}
            <span
              class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            ></span>
          {/if}
          <span>{job.label}: {job.completed}/{job.total}</span>
          {#if job.status !== 'running'}
            <button
              type="button"
              class="ml-2 px-2"
              aria-label="Dismiss progress"
              onclick={() => jobs.dismiss(job.id)}
            >
              ×
            </button>
          {/if}
        </div>
        {#if job.errors}
          <p>{job.errors} failed</p>
        {/if}
        {#if job.status === 'stopped'}
          <p>Stopped because account permissions changed.</p>
        {/if}
        {#if job.status === 'failed'}
          <p>Could not finish. Some changes may have saved.</p>
        {/if}
      </div>
    {/each}
  </div>
{/if}
