<script lang="ts">
// Components
import Header from '$lib/components/forms/FormHeader.svelte';
import Actions from '$lib/components/forms/FormActionsUser.svelte';
import UserField from '$lib/components/forms/FormFieldUsers.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FormField, ResourceType, FalsableRef, FalsableFacetType } from '$lib/types';
type Props = {
  title: string;
  subtitle: string;
  fields: FormField;
  facet: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, subtitle, fields, facet, entity, resourceType }: Props = $props();

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
  <Header
    {title}
    {subtitle}
    {Actions}
    bind:actionProps
    {fields}
    {resourceType}
    {errors}
    {entity} />
  {#each Object.entries(fields) as [fieldId, field]}
    <UserField
        bind:actionProps
        {fieldId}
        {field}
        {form}
        {constraints}
        {errors}
        userJoinStateKey="role"
        checkedValue={resourceType === 'project' ? 'maintainer' : 'owner'}
        uncheckedValue='member'
        {entity}
        {resourceType} />
  {/each}
</div>
