<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { getCachedFeatureBoolean } from '$lib/client/services/stats'
// ICONS
import { CircleStack } from '@steeze-ui/heroicons'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

let {
  feature,
  appCtx,
  showTitle = true,
}: {
  feature: Feature
  appCtx: AppCtx
  showTitle?: boolean
} = $props()

const isPendingReview = $derived(
  getCachedFeatureBoolean(
    appCtx,
    feature,
    'isPendingReview',
    (f: Feature) => f.isPendingReview,
  ),
)
const isPublished = $derived(
  getCachedFeatureBoolean(
    appCtx,
    feature,
    'isPublished',
    (f: Feature) => f.isPublished,
  ),
)
const isVisitable = $derived(
  getCachedFeatureBoolean(
    appCtx,
    feature,
    'isVisitable',
    (f: Feature) => f.isVisitable,
  ),
)
const isIntangible = $derived(
  getCachedFeatureBoolean(
    appCtx,
    feature,
    'isIntangible',
    (f: Feature) => f.isIntangible,
  ),
)

const statuses = $derived.by(() => {
  const result: Record<string, boolean> = {}

  const statusItems = [
    { key: m.plain_broad_shell_dart(), value: !isPendingReview },
    { key: m.published(), value: isPublished },
    { key: m.dry_aware_squirrel_cheer(), value: isVisitable },
    { key: m.teary_fit_maggot_socket(), value: !isIntangible },
  ]

  statusItems.forEach(({ key, value }) => {
    const displayKey = value ? key : `${m.filters__not()} ${key}`
    result[displayKey] = value
  })

  return result
})
</script>

<ProgressPips title={m.filters__status()} icon={CircleStack} {statuses} {showTitle} />
