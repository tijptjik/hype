<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import EntityCard from '$lib/components/resources/EntityCard.svelte';
// TYPES
import type { KeyMap, Feature } from '$lib/types';

let { entity }: { entity: Feature } = $props();

const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: []
};
</script>

<EntityCard {entity} {keyMap}>
  {#snippet footer()}
    <div class="font-mono text-xs uppercase tracking-wider text-neutral-content">
      {#if entity.isPublished}
        <span class="text-ok">{m.long_zippy_felix_mix()}</span>
      {:else}
        <span class="text-error">{m.weak_super_guppy_nail()}</span>
      {/if}
    </div>
    <div class="flex flex-row items-center gap-2">
      <div class="font-mono text-xs uppercase text-neutral-content">
        {entity.isVisitable ? 'Visitable' : 'Not Visitable'}
      </div>
    </div>
  {/snippet}
</EntityCard>
