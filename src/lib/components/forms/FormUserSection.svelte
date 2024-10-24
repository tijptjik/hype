<script lang="ts">
// Components
import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
import FormUserActions from '$lib/components/forms/FormUserActions.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FormField, ResourceType, FalsableRef } from '$lib/types';

type Props = {
  title: string;
  fields: FormField;
  entity: FalsableRef;
  resourceType: Exclude<ResourceType, 'layer' | 'feature'>;
};

// STATE : PROPS
let { title, fields, entity, resourceType }: Props = $props();

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <FormSectionHeader
    {title}
    Actions={FormUserActions}
    bind:actionProps
    {fields}
    {resourceType}
    {errors}
    {entity} />
  {#each Object.entries(fields) as [fieldId, field]}
    <field.component
      bind:actionProps
      {fieldId}
      {field}
      {form}
      {constraints}
      {errors}
      userJoinStateKey="role"
      checkedValue={entity === 'project' ? 'member' : 'owner'}
      uncheckedValue={entity === 'project' ? 'maintainer' : 'member'}
      {entity}
      {resourceType} />
  {/each}
</div>
