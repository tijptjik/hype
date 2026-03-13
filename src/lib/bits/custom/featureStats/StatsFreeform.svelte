<script lang="ts">
// I18N
import { getLocaleKey, m } from '$lib/i18n'
// COMPONENTS
import StatsPips from './components/StatsPips.svelte'
// SERVICES
import { calculateFreeformStatuses } from '$lib/client/services/stats'
// ICONS
import PenIcon from 'virtual:icons/lucide/pen'
// TYPES
import type { FeatureStatsProps } from './featureStats.types'

let { feature, appCtx, showTitle = true }: FeatureStatsProps = $props()
const localeKey = $derived(getLocaleKey())
const statuses = $derived(calculateFreeformStatuses(feature, appCtx, localeKey))
</script>

<StatsPips
  title={m.admin__forms_common_specifiers_short()}
  icon={PenIcon}
  {statuses}
  {showTitle}
/>
