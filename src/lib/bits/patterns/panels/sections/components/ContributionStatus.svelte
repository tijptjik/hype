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
      ? 'border-blue-700 bg-blue-700 text-white'
      : status === 'rejected'
        ? 'border-red-700 bg-red-700 text-white'
        : 'border-yellow-300 bg-yellow-300 text-yellow-950'}"
  >
    {status === 'submitted'
      ? m.profile__status_submitted()
      : status === 'rejected'
        ? m.profile__status_rejected()
        : m.profile__status_unpublished()}
  </span>
{/if}
