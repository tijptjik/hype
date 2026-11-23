<script lang="ts">
// COMPONENTS
import Root from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarRoot.svelte'
import TriStateToggle from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
// ICONS
import FilterIcon from 'virtual:icons/proicons/filter'
import CategoryIcon from 'virtual:icons/lucide/tags'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// DOMAIN
import { BRAND_LOCATION_STATES } from '#lib/locations/brandLocationMap.js'
import { placeCategoryLabel } from '#lib/locations/placeSearchFilters.js'

let {
  hype,
  upstream,
  linked,
  category,
  categories,
  count,
  busy,
  onHype,
  onUpstream,
  onLinked,
  onCategory,
  onReset,
}: {
  hype: boolean | null
  upstream: boolean | null
  linked: boolean | null
  category: string
  categories: string[]
  count: number | null
  busy: boolean
  onHype: (value: boolean | null) => void
  onUpstream: (value: boolean | null) => void
  onLinked: (value: boolean | null) => void
  onCategory: (value: string) => void
  onReset: () => void
} = $props()
const categoryItems = $derived(
  categories
    .map(value => ({ value, label: placeCategoryLabel(value) }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, canonicalContentTag(getLocaleKey())),
    ),
)
</script>

<Root
  filterLabel="Filter by"
  filterIcon={FilterIcon}
  hasActiveSection
  disableMenuToggle
  showSort={false}
  {count}
  countLoading={busy}
  {onReset}
  resetDisabled={hype === null && upstream === null && linked === null && !category}
  class="[container-type:inline-size]"
>
  {#snippet filterActiveContent()}
    <fieldset
      class="flex h-16 max-w-[calc(100cqw-18rem)] [scrollbar-width:none] items-center gap-4 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden"
      aria-label="Location filters"
    >
      <div class="flex shrink-0 items-center gap-2 pr-3">
        <span class="sr-only">Category</span>
        <div class="w-80">
          <SearchSelect
            label="Filter by category"
            plain
            clearOnOpen
            selectedToken
            icon={CategoryIcon}
            value={category}
            items={[{ value: '__all__', label: 'All categories' }, ...categoryItems]}
            onSelect={value => onCategory(value === '__all__' ? '' : value)}
          />
        </div>
      </div>
      <TriStateToggle
        class="min-w-44 shrink-0"
        label="Record @ HYPE"
        alwaysShowLabels
        falseColor={BRAND_LOCATION_STATES[0].no}
        trueColor={BRAND_LOCATION_STATES[0].yes}
        falseLabel="No"
        trueLabel="Yes"
        currentValue={hype}
        onCheckedChange={onHype}
      />
      <TriStateToggle
        class="min-w-44 shrink-0"
        label="Record @ SaanSeoi"
        alwaysShowLabels
        falseColor={BRAND_LOCATION_STATES[1].no}
        trueColor={BRAND_LOCATION_STATES[1].yes}
        falseLabel="No"
        trueLabel="Yes"
        currentValue={upstream}
        onCheckedChange={onUpstream}
      />
      <TriStateToggle
        class="min-w-44 shrink-0"
        label="Has Linked Features"
        alwaysShowLabels
        falseColor={BRAND_LOCATION_STATES[2].no}
        trueColor={BRAND_LOCATION_STATES[2].yes}
        falseLabel="No"
        trueLabel="Yes"
        currentValue={linked}
        onCheckedChange={onLinked}
      />
    </fieldset>
  {/snippet}
</Root>
