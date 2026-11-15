<script lang="ts">
// COMPONENTS
import Root from '../resourceControlBar/components/ResourceControlBarRoot.svelte'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import Button from '#lib/bits/core/button/Button.svelte'
import CatalogueQualityFilters from './CatalogueQualityFilters.svelte'
// ICONS
import OriginIcon from 'virtual:icons/lucide/map-pin'
import ImageIcon from 'virtual:icons/lucide/image'
// TYPES
import type {
  LogoQualityFilters,
  LogoQualityKey,
} from '#lib/locations/catalogueQuality'
let {
  quality,
  origin,
  origins,
  count,
  loading,
  onQuality,
  onOrigin,
  onReset,
}: {
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
let section = $state<'origin' | 'quality'>('quality')
</script>
<Root
  filterLabel={section === 'origin' ? 'Origin' : 'Image quality'}
  filterIcon={section === 'origin' ? OriginIcon : ImageIcon}
  hasActiveSection
  showSort={false}
  {count}
  countLoading={loading}
  resetDisabled={!origin && !Object.keys(quality).length}
  {onReset}
  class="[container-type:inline-size]"
>
  {#snippet filterMenuContent({ closeMenu })}
    <Button
      text={section === 'origin' ? 'Image quality' : 'Origin'}
      iconComponent={section === 'origin' ? ImageIcon : OriginIcon}
      style="transparent"
      size="sm"
      onClick={() => {
        section = section === 'origin' ? 'quality' : 'origin'
        closeMenu()
      }}
    />
  {/snippet}
  {#snippet filterActiveContent()}
    <div
      class="flex h-16 max-w-[calc(100cqw-18rem)] items-center gap-6 overflow-x-auto px-4"
    >
      {#if section === 'quality'}
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
