<script lang="ts">
// COMPONENTS
import ResourceHeader from '$lib/components/sidebar/ResourceHeader.svelte';
import ResourceContainer from '$lib/components/sidebar/ResourceContainer.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';

// PROPS
let { resourceType }: { resourceType: FirstClassResource } = $props();
</script>

<!-- RESOURCE -->
<ResourceHeader {resourceType} />
<ResourceContainer {resourceType} />
