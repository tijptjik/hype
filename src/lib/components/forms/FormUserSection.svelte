<script lang="ts">
import { getForm } from '$lib/context/forms.svelte';
// Components
import type { Component } from 'svelte';
import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
import FormUserActions from '$lib/components/forms/FormUserActions.svelte';

// Types
type Props = {
  title: string;
  fields: Record<string, Record<string, string>>;
};

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

// STATE : PROPS
let { title, fields }: Props = $props();

const { form, errors, constraints } = getForm();
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <FormSectionHeader {title} Actions={FormUserActions} bind:actionProps {fields} {errors} />
  {#each Object.entries(fields) as [fieldId, field]}
    <!-- svelte-ignore svelte_component_deprecated -->
    <svelte:component
      this={field.component as Component}
      bind:actionProps
      {fieldId}
      {field}
      {form}
      {constraints}
      {errors}
      userJoinStateKey="role"
      checkedValue="owner"
      uncheckedValue="member" />
  {/each}
</div>
