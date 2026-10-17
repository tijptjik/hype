<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
import FiltersPanel from '#lib/bits/patterns/filtersPanel/FiltersPanel.svelte'
import '#lib/styles/app.css'
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import type { usePanelShellModel } from '#lib/adapters/panels/usePanelShellModel.svelte.js'
let selected = $state<string[]>([])
let range = $state<[number, number]>([1, 5])
const properties = [
  {
    id: 'material',
    key: 'material',
    component: 'SelectField',
    values: [{ id: 'paint' }, { id: 'metal' }, { id: 'stone' }],
  },
  { id: 'grade', key: 'grade', component: 'RangeField' },
]
const model = {
  divisionClasses: [],
  selectedNeighbourhoods: [],
  neighbourhoods: [],
  visibleNeighbourhoodCount: 0,
  categories: [
    {
      hierarchy: {
        organisation: 'HKGhostSigns',
        project: 'All',
        layer: 'Ghost Signs',
        layerId: 'ghosts',
      },
      properties,
      selectedSummary: '',
    },
  ],
  get hasActiveFilters() {
    return selected.length > 0 || range[0] !== 1 || range[1] !== 5
  },
  resetText: 'Clear filters',
  reset() {
    selected = []
    range = [1, 5]
  },
  propertyFilter(property: { key: string }) {
    return {
      label: property.key,
      options: new Map([
        ['paint', 'Paint'],
        ['metal', 'Metal'],
        ['stone', 'Stone'],
      ]),
      get selectedIds() {
        return selected
      },
      get displayText() {
        return property.key === 'grade'
          ? range.join(' – ')
          : selected.join(', ') || 'All'
      },
      get rangeValues() {
        return range
      },
      min: 1,
      max: 5,
      toggle(id: string) {
        selected = selected.includes(id)
          ? selected.filter(v => v !== id)
          : [...selected, id]
      },
      setRange(value: [number, number]) {
        range = value
      },
    }
  },
} as unknown as ReturnType<typeof useFilterPanelModel>
const shell = {
  open: true,
  onClose() {},
  panel: {
    panelType: 'filters',
    position: 'right',
    inline: false,
    scrollable: true,
    isNarrow: false,
    isAdmin: false,
  },
} as unknown as ReturnType<typeof usePanelShellModel>
</script>
<div class="relative h-screen bg-surface"><FiltersPanel {model} {shell} /></div>
