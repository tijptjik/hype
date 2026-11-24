<script lang="ts">
import CatalogueQualityBadges from '../catalogueQuality/CatalogueQualityBadges.svelte'
// COMPONENTS
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import IndexCardSkeleton from '#lib/bits/patterns/cards/indexCard/IndexCardSkeleton.svelte'
// DOMAIN
import {
  catalogueDisplayName,
  catalogueDisplayLogo,
  catalogueLogoBackground,
  catalogueLogoFallbacks,
} from '#lib/locations/cataloguePresentation.js'
// TYPES
import type { IdentityCatalogueRecord } from '#lib/locations/identityCatalogue.js'
let {
  records,
  compact,
  loading,
  loadingMore,
  theme,
  mode,
  onNavigate,
}: {
  records: IdentityCatalogueRecord[]
  compact: boolean
  loading: boolean
  loadingMore: boolean
  theme: string
  mode: 'light' | 'dark'
  onNavigate: (record: IdentityCatalogueRecord) => void
} = $props()
</script>
<section
  data-catalogue-grid={compact ? 'compact' : 'regular'}
  class={compact
    ? String.raw`grid grid-cols-8 gap-2 [&_.bits-index-card\_\_body]:px-2 [&_.bits-index-card\_\_body]:py-2 [&_.bits-index-card\_\_title]:text-xs [&_.bits-index-card\_\_title]:break-words [&_.bits-index-card\_\_description]:hidden`
    : 'grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4'}
  role={loading && !records.length ? 'status' : undefined}
  aria-label={loading && !records.length ? 'Loading catalogue' : 'Catalogue cards'}
  aria-busy={loading || loadingMore}
>
  {#if loading && !records.length}
    {#each Array(compact ? 16 : 8) as _}
      <IndexCardSkeleton subtleImage />
    {/each}
  {/if}
  {#each records as record (record.id)}
    <IndexCard
      title={catalogueDisplayName(record)}
      description={record.code ?? record.id}
      imageSrc={catalogueDisplayLogo(record, theme, mode) ??
        catalogueLogoFallbacks(record)[0] ??
        ''}
      imageFallbackSrcs={catalogueLogoFallbacks(record)}
      imageAlt={catalogueDisplayName(record)}
      imageLayout="contain"
      imageInset={true}
      imageBackground={catalogueLogoBackground(record, theme, mode)}
      onNavigate={() => onNavigate(record)}
    >
      {#snippet footer()}
        {#if record.kind === 'brand'}
          <CatalogueQualityBadges {record} />
        {/if}
      {/snippet}
    </IndexCard>
  {/each}
  {#if loadingMore}
    {#each Array(compact ? 16 : 8) as _}
      <IndexCardSkeleton subtleImage />
    {/each}
  {/if}
</section>

<style>
/* Let the card background show through while inset catalogue artwork loads. */
section :global([data-image-skeleton]) {
  background: radial-gradient(
    ellipse,
    color-mix(in srgb, currentColor 4%, transparent),
    transparent 70%
  );
}

section :global([data-image-skeleton] > div) {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  section :global([data-image-skeleton]) {
    animation: catalogue-image-breathe 2s ease-in-out infinite;
  }
}

@keyframes catalogue-image-breathe {
  50% {
    opacity: 0.35;
  }
}
</style>
