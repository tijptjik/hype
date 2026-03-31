<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { calculateStatusStatuses } from '$lib/client/services/stats'
// ICONS
import DatabaseIcon from 'virtual:icons/lucide/database'
// TYPES
import type { FeatureStatsProps } from './featureStats.types'
// COMPONENTS
import StatsPips from './components/StatsPips.svelte'

let { feature, appCtx, showTitle = true }: FeatureStatsProps = $props()
const statuses = $derived(calculateStatusStatuses(appCtx, feature))
</script>

<StatsPips title={m.filters__status()} icon={DatabaseIcon} {statuses} {showTitle} />
