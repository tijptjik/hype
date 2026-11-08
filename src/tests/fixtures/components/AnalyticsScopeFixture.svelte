<script lang="ts">
import type { Component } from 'svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import RefreshIcon from 'virtual:icons/proicons/arrow-sync'
setResponsiveCtx()
import AnalyticsScopePicker from '#lib/bits/patterns/analytics/AnalyticsScopePicker.svelte'
import ProductUsageDashboard from '#lib/bits/patterns/analytics/ProductUsageDashboard.svelte'
import AnalyticsMemberAccess from '#lib/bits/patterns/analytics/AnalyticsMemberAccess.svelte'

let value = $state('project:p')
let granted = $state(false)
let hostname = $state('*')
const options = [
  { type: 'project' as const, id: 'p', label: 'Project · Community food distribution' },
  {
    type: 'organisation' as const,
    id: 'o',
    label: 'Organisation · Community projects',
  },
]
</script>
<div
  class="bits-theme flex min-h-screen min-w-0 flex-col gap-4 p-3"
  data-analytics-fixture
>
  <Header
    avatar={{ isVisible: false }}
    facets={{
      items: ['Usage', 'Views', 'Audience', 'Assets', 'Data'].map(label => ({
        ref: label,
        label,
        icon: RefreshIcon,
      })),
      active: 'Usage',
    }}
    viewActions={{
      isVisible: true,
      controlsAction: { text: 'Refresh', icon: RefreshIcon, onClick: () => {} },
      content: {
        component: AnalyticsScopePicker as unknown as Component<
          Record<string, unknown>
        >,
        props: {
          options,
          value,
          onChange: (next: string) => (value = next),
          hosts: ['*', 'hkghostsigns.com'],
          hostname,
          onHostChange: (next: string) => (hostname = next),
          details:
            'Counts visits to resource pages. Activity within shared maps cannot be attributed. Historical results follow current resource ownership.',
        },
      },
    }}
  />
  <output aria-label="Selected scope">{value}</output>
  <ProductUsageDashboard
    state={{
      status: 'success',
      environment: 'production',
      scope: options.find(option => `${option.type}:${option.id}` === value)?.label,
      totals: [{ event: 'feature.view', count: 241 }],
      rankings: [],
    }}
  />
  <AnalyticsMemberAccess
    rows={[{ userId: 'member', name: 'Organisation member', enabled: granted }]}
    isEditing
    onChange={({ value }) => (granted = value)}
  />
  <output aria-label="Delegated access">{granted ? 'Granted' : 'Revoked'}</output>
</div>
