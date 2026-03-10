<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte'
// SERVICES
import {
  getCachedFeatureSpecifierTranslation,
  calculateSpecifierTranslation,
} from '$lib/client/services/stats'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import { Language } from '@steeze-ui/heroicons'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { Locale } from '$lib/types'
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

const adminCtx = getAdminCtx()

// Get active translation locales from admin context
const activeTranslationLocales = $derived.by(() => {
  const locales: Locale[] = []
  const translationLocales =
    adminCtx.appCtx.state.viewFilters.feature.translationLocales
  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) {
      locales.push(locale as Locale)
    }
  }
  return locales
})

// Force clear translation cache for this feature to ensure fresh calculations with multi-locale logic
const featureStats = appCtx.cache.stats.get(FirstClassResource.feature)
if (featureStats && featureStats.has(feature.id)) {
  const stats = featureStats.get(feature.id)
  if (stats) {
    // Clear all translation-related cached stats for this feature
    const keysToDelete = []
    for (const key of stats.keys()) {
      if (key.includes('Translated.')) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => stats.delete(key))
  }
}

// Helper function to create translation tooltip
function getTranslationTooltip(fieldName: string, status: boolean | null): string {
  if (status === true) return `${fieldName} ${m.tooltip__translated()}`
  if (status === false)
    return `${fieldName} ${m.filters__not()} ${m.tooltip__translated()}`
  return `${fieldName} ${m.filters__not()} ${m.awful_even_coyote_wish()}`
}

const statuses = $derived.by(() => {
  // Calculate multi-locale translation status - ALL active locales must be translated for green
  const calculateMultiLocaleStatus = (
    fieldKey: 'title' | 'description' | 'displayAddress',
  ) => {
    if (activeTranslationLocales.length === 0) return null

    const i18nEntries = feature?.i18n ?? {}
    const genKey =
      fieldKey === 'title'
        ? 'titleGen'
        : fieldKey === 'description'
          ? 'descriptionGen'
          : 'displayAddressGen'

    // Check if ANY locale has manual content for this field
    const hasAnyManualContent = Object.values(i18nEntries).some((entry: any) => {
      const fieldValue = entry[fieldKey]
      const isGenerated = entry[genKey] ?? false
      return fieldValue && fieldValue.length > 0 && !isGenerated
    })

    if (!hasAnyManualContent) {
      return null // No manual content anywhere
    }

    // Check if ALL active locales have manual translation
    const allActiveLocalesTranslated = activeTranslationLocales.every(locale => {
      const entry = i18nEntries[locale]
      if (!entry) return false // No entry for this locale

      const fieldValue = entry[fieldKey]
      const isGenerated = entry[genKey] ?? false

      return fieldValue && fieldValue.length > 0 && !isGenerated
    })

    return allActiveLocalesTranslated
  }

  const titleStatus = calculateMultiLocaleStatus('title')
  const descriptionStatus = calculateMultiLocaleStatus('description')
  const addressStatus = calculateMultiLocaleStatus('displayAddress')

  const result = {
    [getTranslationTooltip(m.feature__title(), titleStatus)]: titleStatus,
    [getTranslationTooltip(m.feature__description(), descriptionStatus)]:
      descriptionStatus,
    [getTranslationTooltip(m.feature__address(), addressStatus)]: addressStatus,
  }

  // Add property translation status for admin users only (now tri-state)
  if (appCtx.user?.superAdmin) {
    const propertyStatus = getCachedFeatureSpecifierTranslation(appCtx, feature, f =>
      calculateSpecifierTranslation(f),
    )
    result[getTranslationTooltip(m.spicy_ideal_butterfly_revive(), propertyStatus)] =
      propertyStatus
  }

  return result
})
</script>

<ProgressPips title={m.filters__translation()} icon={Language} {statuses} {showTitle} />
