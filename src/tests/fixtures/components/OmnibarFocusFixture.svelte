<script lang="ts">
// COMPONENTS
import OmnibarSection from '#lib/bits/patterns/bars/omnibar/components/OmnibarSection.svelte'
</script>

<div class="bg-panel mx-auto mt-6 w-80">
  <OmnibarSection
    collectionType="layer"
    limit={1}
    onSelection={() => {}}
    results={[
      {
        ref: 'layer',
        name: 'Sheung Wan signs',
        count: 0,
        collectionType: 'layer',
        control: { kind: 'target', label: 'Isolate layer', onClick: () => {} },
      },
    ]}
  />
  <OmnibarSection
    collectionType="neighbourhood"
    limit={1}
    onSelection={() => {}}
    results={[
      {
        ref: 'division',
        name: 'Sheung Wan',
        count: 174,
        collectionType: 'neighbourhood',
      },
    ]}
  />
</div>
