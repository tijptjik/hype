<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte'
// SERVICES
import {
  calculateImageCompletion,
  getCachedFeatureBoolean,
  getCachedFeatureTriState,
} from '$lib/client/services/stats'
// ICONS
import { Photo } from '@steeze-ui/heroicons'
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

const statuses = $derived({
  [m.filters__has() + ' ' + m.organisation__images()]: getCachedFeatureBoolean(
    appCtx,
    feature,
    'hasImage',
    () => calculateImageCompletion(appCtx, feature).hasImage,
  ),
  [m.number__1() + ' ' + m.published()]: getCachedFeatureTriState(
    appCtx,
    feature,
    'isOneImagePublished',
    () => calculateImageCompletion(appCtx, feature).isOneImagePublished,
  ),
  [m.filters__all() + ' ' + m.published()]: getCachedFeatureTriState(
    appCtx,
    feature,
    'isAllImagePublished',
    () => calculateImageCompletion(appCtx, feature).isAllImagePublished,
  ),
})
</script>

<ProgressPips title={m.organisation__images()} icon={Photo} {statuses} {showTitle} />
