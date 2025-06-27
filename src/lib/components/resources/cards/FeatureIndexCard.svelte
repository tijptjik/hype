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

<EntityCard {entity} {keyMap} />
