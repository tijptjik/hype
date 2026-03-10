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
import { Tag } from '@steeze-ui/heroicons'
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

const classifierProperties = $derived(
  sortProperties(
    Array.from(appCtx.cache.property.values())
      .filter(p => p.type === 'classifier')
      .map(property => ({ property })),
  ).map(item => item.property),
)

const statuses = $derived.by(() => {
  const result: Record<string, boolean> = {}

  classifierProperties.forEach(property => {
    const featureProp = feature.properties?.find(fp => fp.propertyId === property.id)
    const propertyLabel = property.i18n?.[getLocale()]?.label ?? property.key

    if (property.component === 'RangeField') {
      // RangeField: check for value presence
      if (
        featureProp?.value &&
        featureProp.value !== null &&
        featureProp.value !== ''
      ) {
        result[`${propertyLabel} : ${featureProp.value}`] = true
      } else {
        result[propertyLabel] = false
      }
    } else {
      // SelectField: check for propertyValueId
      if (featureProp?.propertyValueId) {
        // Find the selected value and show it as true with format "PropertyLabel : ValueLabel"
        const selectedValue = property.values?.find(
          v => v.id === featureProp.propertyValueId,
        )
        if (selectedValue) {
          const valueLabel = selectedValue.i18n?.[getLocale()]?.value ?? 'Unknown'
          result[`${propertyLabel} : ${valueLabel}`] = true
        }
      } else {
        // Show the property name as false (no value selected)
        result[propertyLabel] = false
      }
    }
  })

  return result
})
</script>

<ProgressPips title={m.filters__categories()} icon={Tag} {statuses} {showTitle} />
