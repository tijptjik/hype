<script lang="ts">
// COMPONENTS
import ResourceHeader from '$lib/components/sidebar/ResourceHeader.svelte';
import ResourceContainer from '$lib/components/sidebar/ResourceContainer.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';

// PROPS
let { resourceType }: { resourceType: HierarchicalResource } = $props();
</script>

<!-- RESOURCE -->
<ResourceHeader {resourceType} />
<ResourceContainer {resourceType} />
