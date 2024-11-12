<script lang="ts">
import FormResetButton from './FormResetButton.svelte';
import FormSubmitButton from './FormSubmitButton.svelte';
import PublishButton from './PublishButton.svelte';
import type { FalsableRef, ResourceType } from '$lib/types';

// TYPES
type Props = {
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { entity, resourceType }: Props = $props();
</script>

<li>
  <FormResetButton {entity} {resourceType} />
</li>
<li>
  <FormSubmitButton {entity} {resourceType} />
</li>
{#if resourceType === 'project' || resourceType === 'layer' || resourceType === 'feature'}
  <li>
    <PublishButton {entity} {resourceType} />
  </li>
{/if}
