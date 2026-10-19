<script lang="ts">
// BITS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// I18N
import { m } from '#lib/i18n.js'
// UTILS
import { formatDate } from '#lib'
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

<div class="hidden min-w-0 gap-1 @min-[48rem]:flex @min-[48rem]:flex-col">
  <div class="flex min-w-0 items-center gap-2">
    <small class="sr-only">{m.close_muddy_trout_clap()}</small>
    <SimpleTooltip disabled={!createdAtLabel} triggerProps={{ tabindex: -1 }}>
      {#snippet trigger()}
        <p class="m-0 max-w-44 truncate text-xs text-muted-foreground">
          {createdAtLabel
            ? formatDistanceToNow(new Date(createdAtLabel), { addSuffix: true })
            : '-'}
        </p>
      {/snippet}
      {createdAtLabel ? formatDate(createdAtLabel) : ''}
    </SimpleTooltip>
  </div>

  <div class="flex min-w-0 items-center gap-2">
    <small class="sr-only">{m.profile__role_type__contributor()}</small>
    <SimpleTooltip disabled={!contributorAttribution} triggerProps={{ tabindex: -1 }}>
      {#snippet trigger()}
        <p class="m-0 max-w-44 truncate text-sm text-foreground">
          {contributorName}
        </p>
      {/snippet}
      {contributorAttribution}
    </SimpleTooltip>
  </div>

  {#if reviewerName !== '-'}
    <div class="hidden min-w-0 items-center gap-2 @min-[72rem]:flex">
      <small class="text-xs text-muted-foreground"
        >{m.stock_active_kestrel_offer()}</small
      >
      <SimpleTooltip disabled={!reviewerAttribution} triggerProps={{ tabindex: -1 }}>
        {#snippet trigger()}
          <p class="m-0 max-w-44 truncate text-sm text-foreground">
            {reviewerName}
          </p>
        {/snippet}
        {reviewerAttribution}
      </SimpleTooltip>
    </div>
  {/if}
</div>
