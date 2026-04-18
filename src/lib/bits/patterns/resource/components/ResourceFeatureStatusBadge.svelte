<script lang="ts">
import { m } from '$lib/i18n'
import ResourceStatusBadge from './ResourceStatusBadge.svelte'
import type { ResourceFeatureStatusBadgeProps } from './resourceStatusBadge.types'

let { isPublished, isPendingReview }: ResourceFeatureStatusBadgeProps = $props()

const tone = $derived(isPendingReview ? 'warning' : isPublished ? 'success' : 'error')

const label = $derived(
  isPendingReview
    ? m.tangy_zany_capybara_arise()
    : isPublished
      ? m.published()
      : m.weak_super_guppy_nail(),
)
</script>

<ResourceStatusBadge {label} {tone} />
