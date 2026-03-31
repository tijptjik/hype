<script lang="ts">
import { m } from '$lib/i18n'
import ResourceStatusBadge from './ResourceStatusBadge.svelte'
import type { ResourceTaskStatusBadgeProps } from './resourceStatusBadge.types'

let { entity }: ResourceTaskStatusBadgeProps = $props()

const reviewOutcome = $derived(entity.reviewOutcome)

const label = $derived(
  reviewOutcome
    ? ({
        rejected: m.yummy_front_myna_drip(),
        accepted: m.lazy_super_gecko_bend(),
      }[reviewOutcome] ?? m.candid_drab_gibbon_bubble())
    : m.candid_drab_gibbon_bubble(),
)

const tone = $derived(
  reviewOutcome === 'accepted'
    ? 'success'
    : reviewOutcome === 'rejected'
      ? 'error'
      : 'neutral',
)
</script>

<ResourceStatusBadge {label} {tone} tooltipText={entity.reviewReason || null} />
