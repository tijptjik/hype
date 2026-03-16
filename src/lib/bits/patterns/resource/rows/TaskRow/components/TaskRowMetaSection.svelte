<script lang="ts">
// BITS
import SimpleTooltip from '$lib/bits/core/tooltip/SimpleTooltip.svelte'
// I18N
import { m } from '$lib/i18n'
// UTILS
import { formatDate } from '$lib'
import { formatDistanceToNow } from 'date-fns'

let {
  createdAt,
  contributorName = '-',
  contributorAttribution = '',
  reviewerName = '-',
  reviewerAttribution = '',
}: {
  createdAt?: string | Date | null
  contributorName?: string
  contributorAttribution?: string
  reviewerName?: string
  reviewerAttribution?: string
} = $props()

const createdAtLabel = $derived.by(() => {
  if (!createdAt) return ''
  return createdAt instanceof Date ? createdAt.toISOString() : createdAt
})
</script>

<div class="bits-task-row__meta">
  <div class="bits-task-row__meta-item bits-task-row__meta-item--created">
    <small class="bits-task-row__meta-label">{m.close_muddy_trout_clap()}</small>
    <SimpleTooltip disabled={!createdAtLabel}>
      {#snippet trigger()}
        <p class="bits-task-row__meta-value">
          {createdAtLabel
            ? formatDistanceToNow(new Date(createdAtLabel), { addSuffix: true })
            : '-'}
        </p>
      {/snippet}
      {createdAtLabel ? formatDate(createdAtLabel) : ''}
    </SimpleTooltip>
  </div>

  <div class="bits-task-row__meta-item bits-task-row__meta-item--contributor">
    <small class="bits-task-row__meta-label"
      >{m.profile__role_type__contributor()}</small
    >
    <SimpleTooltip disabled={!contributorAttribution}>
      {#snippet trigger()}
        <p class="bits-task-row__meta-value bits-task-row__meta-value--wide">
          {contributorName}
        </p>
      {/snippet}
      {contributorAttribution}
    </SimpleTooltip>
  </div>

  <div class="bits-task-row__meta-item bits-task-row__meta-item--reviewer">
    <small class="bits-task-row__meta-label">{m.stock_active_kestrel_offer()}</small>
    <SimpleTooltip disabled={!reviewerAttribution}>
      {#snippet trigger()}
        <p class="bits-task-row__meta-value bits-task-row__meta-value--wide">
          {reviewerName}
        </p>
      {/snippet}
      {reviewerAttribution}
    </SimpleTooltip>
  </div>
</div>
