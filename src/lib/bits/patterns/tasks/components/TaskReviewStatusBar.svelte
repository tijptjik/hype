<script lang="ts">
import ScrollableText from '#lib/bits/custom/text/ScrollableText.svelte'
import { UserAttributionCard } from '#lib/bits/index.js'
import { cx } from '#lib/bits/utils.js'
import { getTaskReviewActionLabel } from '#lib/client/services/task.js'
import { m } from '#lib/i18n.js'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import XIcon from 'virtual:icons/proicons/cancel-circle'
import TaskReason from './TaskReason.svelte'

let {
  reviewerId,
  reviewedAt,
  reviewOutcome,
  reviewAction,
  reviewReason = null,
  isCompact = false,
  class: className = '',
}: {
  reviewerId: string | null
  reviewedAt?: string | null
  reviewOutcome?: string | null
  reviewAction?: string | null
  reviewReason?: string | null
  isCompact?: boolean
  class?: string
} = $props()

const outcomeLabel = $derived(
  reviewAction
    ? getTaskReviewActionLabel(reviewAction)
    : reviewOutcome === 'accepted'
      ? m.lazy_super_gecko_bend()
      : reviewOutcome === 'rejected'
        ? m.yummy_front_myna_drip()
        : m.candid_drab_gibbon_bubble(),
)

const outcomeToneClass = $derived(
  reviewOutcome === 'accepted'
    ? 'border-success/30 bg-success/12 text-success'
    : reviewOutcome === 'rejected'
      ? 'border-error/30 bg-error/12 text-error'
      : 'border-foreground/12 bg-foreground/4 text-foreground/75',
)

const OutcomeIcon = $derived(reviewOutcome === 'accepted' ? CheckIcon : XIcon)
const connectorToneClass = $derived(
  reviewOutcome === 'accepted'
    ? 'after:bg-success/35'
    : reviewOutcome === 'rejected'
      ? 'after:bg-error/35'
      : 'after:bg-foreground/16',
)
const connectorClass =
  'relative after:absolute after:top-1/2 after:left-full after:ml-0.25 after:h-1 after:w-3 after:-translate-y-1/2 after:content-[""]'
</script>

<div class={cx('flex items-center justify-end gap-3', className)}>
  {#if reviewerId}
    <UserAttributionCard
      userId={reviewerId}
      date={reviewedAt ?? undefined}
      type="contributor"
      openDirection="right"
      isOpen={true}
      hideDetails={isCompact}
      class={cx(
        '[--bits-feature-attribution-avatar-size:36px]',
        (reviewOutcome || reviewReason) && connectorClass,
        (reviewOutcome || reviewReason) && connectorToneClass,
      )}
    />
  {/if}

  <div
    class={cx(
      'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]',
      outcomeToneClass,
      reviewReason && connectorClass,
      reviewReason && connectorToneClass,
    )}
  >
    <OutcomeIcon class="h-4 w-4" />
    <span>{outcomeLabel}</span>
  </div>

  {#if reviewReason}
    {#if isCompact}
      <TaskReason reason={reviewReason} />
    {:else}
      <div
        class="max-w-[20rem] rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-xs uppercase tracking-[0.18em] text-foreground/60"
        title={reviewReason}
      >
        <ScrollableText
          text={reviewReason}
          padding={16}
          separator="•"
          class="block max-w-[20rem]"
          textClass="whitespace-nowrap"
        />
      </div>
    {/if}
  {/if}
</div>
