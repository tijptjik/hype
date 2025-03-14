<script lang="ts">
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import OmniHeader from './OmniHeader.svelte';
import OmniEntries from './OmniSectionEntries.svelte';

// TYPES
import type { OmniGroup } from '$lib/types';

// CONTEXT
const omniContext = getOmniContext();

// PROPS
type Props = {
  title: string;
  group: OmniGroup;
};

let { title, group }: Props = $props();
</script>

<div class="flex flex-shrink-0 select-none flex-col pb-2 pt-2">
  <OmniHeader {title} {group} />
  <OmniEntries {group} />
</div>
