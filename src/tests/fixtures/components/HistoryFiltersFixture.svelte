<script lang="ts">
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import ResourceHistory from '#lib/bits/patterns/revisionHistory/ResourceHistory.svelte'
import HistoryScopeToggle from '#lib/bits/patterns/revisionHistory/HistoryScopeToggle.svelte'
// CONTEXT
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
let includeDescendants = $state(false)
const header = setHeaderCtrl()
setResponsiveCtx()
/** Supply stable public fixture evidence for browser checks.
 * @returns Two revisions with distinct sources and actors.
 */
async function loadPage(): Promise<OrganisationHistoryPage> {
  return {
    available: true,
    nextCursor: null,
    entries: ['user', 'migration'].map((origin, index) => ({
      id: origin,
      actorId: origin,
      actor: null,
      origin,
      reason: `${origin} revision`,
      createdAt: `2026-11-${11 - index}T12:00:00.000Z`,
      initial: false,
      changes: [
        {
          path: ['name'],
          before: { present: true, value: 'Before' },
          after: { present: true, value: 'After' },
        },
      ],
    })),
  }
}
</script>

<div class="bits-theme bg-panel text-foreground min-h-screen">
  <Header
    title={{ text: 'History fixture' }}
    query={header.historyQuery}
    filter={{
      isFilterable: true,
      placeholder: 'Search history',
      onFilter: value => {
        header.historyQuery = value
      },
    }}
    viewActions={{
      isVisible: true,
      trailingContent: {
        component: HistoryScopeToggle,
        props: {
          includeDescendants,
          onSelect: (value: boolean) => {
            includeDescendants = value
          },
        },
      },
      extraActions: header.state.meta.viewActions,
      controlsAction: {
        text: 'Filters',
        icon: FilterIcon,
        alwaysHideLabel: true,
        attrs: { 'aria-expanded': header.historyFiltersVisible },
        onClick: () => {
          header.historyFiltersVisible = !header.historyFiltersVisible
        },
      },
    }}
    avatar={{ isVisible: false }}
  />
  <ResourceHistory resourceId="fixture" resourceLabel="organisation" {loadPage} />
</div>
