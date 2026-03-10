<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte'

// SERVICES
import { getCachedFeatureBoolean } from '$lib/client/services/stats'
// ICONS
import { BookOpen } from '@steeze-ui/heroicons'
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

const statuses = $derived.by(() => {
  const result: Record<string, boolean> = {}

  const contentItems = [
    {
      key: m.feature__title(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasTitle', f =>
        (Object.values(f?.i18n ?? {}) as any[]).some(
          t => !t.titleGen && t.title && t.title.length > 0,
        ),
      ),
    },
    {
      key: m.feature__description(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasDescription', f =>
        (Object.values(f?.i18n ?? {}) as any[]).some(
          t => !t.descriptionGen && t.description && t.description.length > 0,
        ),
      ),
    },
    {
      key: m.feature__address(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasDisplayAddress', f =>
        (Object.values(f?.i18n ?? {}) as any[]).some(
          t => !t.displayAddressGen && t.displayAddress && t.displayAddress.length > 0,
        ),
      ),
    },
  ]

  contentItems.forEach(({ key, value }) => {
    const displayKey = value
      ? `${m.filters__has()} ${key}`
      : `${m.filters__no()} ${key}`
    result[displayKey] = value
  })

  return result
})
</script>

<ProgressPips title={m.filters__content()} icon={BookOpen} {statuses} {showTitle} />
