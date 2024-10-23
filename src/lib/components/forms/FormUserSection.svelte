<script lang="ts">
// Components
import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
import FormUserActions from '$lib/components/forms/FormUserActions.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FormField, ResourceType } from '$lib/types';

type Props = {
  title: string;
  fields: FormField;
  entity: string;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, fields, entity, resourceType }: Props = $props();

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

// STATE : CONTEXT
const { form, errors, constraints } = getForm(entity, resourceType);
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <FormSectionHeader
    {title}
    Actions={FormUserActions}
    bind:actionProps
    {fields}
    {errors}
    {entity} />
  {#each Object.entries(fields) as [fieldId, field]}
    {@const UserComponent = field.component}
    <UserComponent
      bind:actionProps
      {fieldId}
      {field}
      {form}
      {constraints}
      {errors}
      userJoinStateKey="role"
      checkedValue="owner"
      uncheckedValue="member"
      {entity}
      {resourceType} />
  {/each}
</div>
