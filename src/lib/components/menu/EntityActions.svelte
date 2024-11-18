<script lang="ts">
import FormResetButton from './FormResetButton.svelte';
import FormSubmitButton from './FormSubmitButton.svelte';
import PublishButton from './PublishButton.svelte';
import type { NavProps } from '$lib/types';

// STATE : PROPS
let navProps: NavProps = $props();
let { resource } = navProps;

</script>

<li>
  <FormResetButton {...navProps} />
</li>
<li>
  <FormSubmitButton {...navProps} />
</li>
{#if resource === 'project' || resource === 'layer' || resource === 'feature'}
  <li>
    <PublishButton {...navProps} />
  </li>
{/if}
