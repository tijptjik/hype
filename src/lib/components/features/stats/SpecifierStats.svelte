<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte'
// LOCALE
import { getLocale } from '$lib/i18n'
// SERVICES
import { sortProperties } from '$lib/client/services/property'
// ICONS
import { Pencil } from '@steeze-ui/heroicons'
// TYPES
import type { Feature } from '$lib/types'
import type { AppCtx } from '$lib/context/app.svelte'

let {
  feature,
  appCtx,
  showTitle = true,
}: {
  feature: Feature
  appCtx: AppCtx
  showTitle?: boolean
} = $props()

const specifierProperties = $derived(
  sortProperties(
    Array.from(appCtx.cache.property.values())
      .filter(p => p.type === 'specifier')
      .map(property => ({ property })),
  ).map(item => item.property),
)

const statuses = $derived.by(() => {
  const result: Record<string, boolean> = {}

  specifierProperties.forEach(property => {
    const featureProp = feature.properties?.find(fp => fp.propertyId === property.id)
    const propertyLabel = property.i18n?.[getLocale()]?.label ?? property.key

    // Check if specifier has any value and get the actual value
    let actualValue = ''
    let hasValue = false

    if (featureProp) {
      // Check for single value first (non-translatable specifier)
      if (featureProp.value && featureProp.value.length > 0) {
        actualValue = featureProp.value
        hasValue = true
      } else if (featureProp.i18n) {
        // Check for i18n values (translatable specifier)
        const localeValue = featureProp.i18n[getLocale()]?.value
        if (localeValue && localeValue.length > 0) {
          actualValue = localeValue
          hasValue = true
        }
      }
    }

    if (hasValue && actualValue) {
      result[`${propertyLabel} : ${actualValue}`] = true
    } else {
      result[propertyLabel] = false
    }
  })

  return result
})
</script>

<ProgressPips
  title={m.admin__forms_common_specifiers_short()}
  icon={Pencil}
  {statuses}
  {showTitle}
/>
