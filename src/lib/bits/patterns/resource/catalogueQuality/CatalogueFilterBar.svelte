<script lang="ts">
// COMPONENTS
import Root from '../resourceControlBar/components/ResourceControlBarRoot.svelte'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import Button from '#lib/bits/core/button/Button.svelte'
import CatalogueQualityFilters from './CatalogueQualityFilters.svelte'
// ICONS
import OriginIcon from 'virtual:icons/lucide/map-pin'
import ImageIcon from 'virtual:icons/lucide/image'
import StatusIcon from 'virtual:icons/lucide/list-filter'
import TriStateToggle from '../resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
// TYPES
import type {
  LogoQualityFilters,
  LogoQualityKey,
} from '#lib/locations/catalogueQuality'
let {
  quality,
  isArchived = false,
  independent = null,
  showArchive = false,
  showIndependent = false,
  onArchive,
  onIndependent,
  origin,
  origins,
  count,
  loading,
  onQuality,
  onOrigin,
  onReset,
}: {
  isArchived?: boolean | null
  independent?: boolean | null
  showArchive?: boolean
  showIndependent?: boolean
  onArchive?: (value: boolean | null) => void
  onIndependent?: (value: boolean | null) => void
  quality: LogoQualityFilters
  origin: string
  origins: string[]
  count: number
  loading: boolean
  onQuality: (key: LogoQualityKey, value: boolean | null) => void
  onOrigin: (value: string) => void
  onReset: () => void
} = $props()
const originLabels: Record<string, string> = {
  'brand:mtr-business-label': 'MTR',
  'brand:wikidata': 'Wikidata',
  'brand:breadline': 'Breadline',
  'brand:breadlineBrand': 'Breadline',
  'brand:source-name': 'Imported by name',
}
let section = $state<'origin' | 'quality' | 'status'>('quality')
const sections = $derived([
  { key: 'origin' as const, label: 'Origin', icon: OriginIcon },
  { key: 'quality' as const, label: 'Image quality', icon: ImageIcon },
  ...(showArchive || showIndependent
    ? [{ key: 'status' as const, label: 'Status', icon: StatusIcon }]
    : []),
])
const activeSection = $derived(
  sections.find(item => item.key === section) ?? sections[1],
)
</script>
<Root
  filterLabel={activeSection.label}
  filterIcon={activeSection.icon}
  hasActiveSection
  showSort={false}
  {count}
  countLoading={loading}
  resetDisabled={!origin &&
    !Object.keys(quality).length &&
    isArchived === false &&
    independent === null}
  {onReset}
  class="[container-type:inline-size]"
>
  {#snippet filterMenuContent({ closeMenu })}
    {#each sections.filter(item => item.key !== activeSection.key) as item (item.key)}
      <Button
        text={item.label}
        iconComponent={item.icon}
        style="transparent"
        size="sm"
        onClick={() => {
          section = item.key
          closeMenu()
        }}
      />
    {/each}
  {/snippet}
  {#snippet filterActiveContent()}
    <div
      class="flex h-16 max-w-[calc(100cqw-18rem)] items-center gap-6 overflow-x-auto px-4"
    >
      {#if activeSection.key === 'status'}
        {#if showArchive}
          <TriStateToggle
            label="Archived"
            alwaysShowLabels
            falseLabel="Not"
            trueLabel="Is"
            currentValue={isArchived}
            onCheckedChange={value => onArchive?.(value)}
          />
        {/if}
        {#if showIndependent}
          <TriStateToggle
            label="Independent"
            alwaysShowLabels
            falseLabel="No"
            trueLabel="Yes"
            currentValue={independent}
            onCheckedChange={value => onIndependent?.(value)}
          />
        {/if}
      {:else if activeSection.key === 'quality'}
        <CatalogueQualityFilters value={quality} onChange={onQuality} />
      {:else}
        <div class="w-72 shrink-0">
          <SearchSelect
            label="Catalogue origin"
            plain
            selectedToken
            value={origin || '__all__'}
            items={[
              { value: '__all__', label: 'Any origin' },
              { value: 'unrecorded', label: 'Unrecorded' },
              ...origins.map(value => ({ value, label: originLabels[value] ?? value })),
            ]}
            onSelect={value => onOrigin(value === '__all__' ? '' : value)}
          />
        </div>
      {/if}
    </div>
  {/snippet}
</Root>
