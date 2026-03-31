<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import StatsPips from './components/StatsPips.svelte'
// SERVICES
import {
  calculateTranslationStatuses,
  clearCachedFeatureTranslationStats,
} from '$lib/client/services/stats'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { LocaleKey } from '$lib/types'
import type { FeatureStatsProps } from './featureStats.types'

let { feature, appCtx, showTitle = true }: FeatureStatsProps = $props()

const adminCtx = getAdminCtx()

const activeTranslationLocales = $derived.by(() => {
  const locales: LocaleKey[] = []
  const translationLocales =
    adminCtx.appCtx.state.viewFilters.feature.translationLocales
  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) locales.push(locale as LocaleKey)
  }
  return locales
})

$effect(() => {
  clearCachedFeatureTranslationStats(appCtx, feature.id)
})
const statuses = $derived(
  calculateTranslationStatuses(
    appCtx,
    feature,
    activeTranslationLocales,
    Boolean(appCtx.user && 'superAdmin' in appCtx.user && appCtx.user.superAdmin),
  ),
)
</script>

<StatsPips
  title={m.filters__translation()}
  icon={LanguagesIcon}
  {statuses}
  {showTitle}
/>
