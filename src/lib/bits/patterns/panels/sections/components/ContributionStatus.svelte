<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { ContributionStatus } from '#lib/contributions/profile.js'
let { status }: { status: ContributionStatus } = $props()
</script>

{#if status !== 'published'}
  <span
    class="inline-flex w-fit shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight {status ===
    'submitted'
      ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300 [[data-theme$=-light]_&]:text-blue-700'
      : status === 'rejected'
        ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 [[data-theme$=-light]_&]:text-red-700'
        : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 [[data-theme$=-light]_&]:text-yellow-800'}"
  >
    {status === 'submitted'
      ? m.profile__status_submitted()
      : status === 'rejected'
        ? m.profile__status_rejected()
        : m.profile__status_unpublished()}
  </span>
{/if}
