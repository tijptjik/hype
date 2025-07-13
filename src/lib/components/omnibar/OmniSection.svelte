<script lang="ts">
// COMPONENTS
import OmniHeader from './OmniHeader.svelte';
import OmniEntries from './OmniSectionEntries.svelte';

// TYPES
import type { OmniCollection } from '$lib/enums';

// PROPS
type Props = {
  collectionType: OmniCollection;
};

let { collectionType }: Props = $props();
</script>

<div class="flex flex-shrink-0 select-none flex-col pb-2 pt-2">
  <OmniHeader {collectionType} />
  <OmniEntries {collectionType} />
</div>
