<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import StatsPips from './components/StatsPips.svelte'
// SERVICES
import { calculateContentStatuses } from '$lib/client/services/stats'
// ICONS
import BookOpenIcon from 'virtual:icons/lucide/book-open'
// TYPES
import type { FeatureStatsProps } from './featureStats.types'

let { feature, appCtx, showTitle = true }: FeatureStatsProps = $props()
const statuses = $derived(calculateContentStatuses(appCtx, feature))
</script>

<StatsPips title={m.filters__content()} icon={BookOpenIcon} {statuses} {showTitle} />
