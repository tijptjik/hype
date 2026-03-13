<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import StatsPips from './components/StatsPips.svelte'
// SERVICES
import { calculateImageStatuses } from '$lib/client/services/stats'
// ICONS
import ImageIcon from 'virtual:icons/lucide/image'
// TYPES
import type { FeatureStatsProps } from './featureStats.types'

let { feature, appCtx, showTitle = true }: FeatureStatsProps = $props()
const statuses = $derived(calculateImageStatuses(appCtx, feature))
</script>

<StatsPips title={m.organisation__images()} icon={ImageIcon} {statuses} {showTitle} />
