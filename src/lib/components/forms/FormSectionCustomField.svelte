<script lang="ts">
import { createEventDispatcher } from 'svelte';
// COMPONENTS
import Tags from "svelte-tags-input";
import Header from '$lib/components/forms/FormHeader.svelte';
import Actions from '$lib/components/forms/FormActionsCustomField.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { CustomPropertyType, ComponentType, CustomProperty, ProjectMetadata, FormField, FalsableRef, ResourceType } from '$lib/types';


// TYPES
type Props = {
  title: string;
  fields: FormField;
  entity: FalsableRef;
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
const { form, errors, constraints } = getForm(resourceType, entity);

// EVENTS
const dispatch = createEventDispatcher();

let metadata = $state({});
let customProperties: CustomProperty[] = [];

$effect(() => {
  customProperties = Object.entries(fields.metadata).flatMap(
    ([type, properties]) =>
      Object.entries(properties).map(([key, prop]) => ({ ...prop, type: type as CustomPropertyType, key }))
  );
});

const customPropertyTypes: CustomPropertyType[] = ['classifiers', 'specifiers', 'display'];
const componentTypes: ComponentType[] = ['FormSelectField', 'FormRangeField', 'FormInputField', 'FormTextField'];

function addCustomProperty() {
  console.log('addCustomProperty');
  const newProperty: CustomProperty = {
    type: 'classifiers',
    key: '',
    label: '',
    component: 'FormInputField'
  };
  customProperties = [...customProperties, newProperty];
  updateMetadata();
}

function removeCustomProperty(index: number) {
  customProperties = customProperties.filter((_, i) => i !== index);
  updateMetadata();
}

function updateMetadata() {
  metadata = customProperties.reduce((acc, prop) => {
    if (!acc[prop.type]) acc[prop.type] = {};
    acc[prop.type][prop.key] = prop;
    return acc;
  }, {} as ProjectMetadata);
  dispatch('change', metadata);
}

function isValidJavascriptKey(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}
const addAction = () => addCustomProperty();
</script>

<div
  class="overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header
    {title}
    {Actions}
    {addAction}
    bind:actionProps
    {fields}
    {resourceType}
    {errors}
    {entity} />

</div>
<div class="space-y-4">
  {#each customProperties as property, index}
    <div class="bg-base-200 p-4 rounded-lg">
      <div class="grid grid-cols-2 gap-4">
        <div class="form-control">
          <label class="label" for={`type-${index}`}>Type</label>
          <select
            id={`type-${index}`}
            class="select select-bordered w-full"
            bind:value={property.type}
            on:change={updateMetadata}
          >
            {#each customPropertyTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

        <div class="form-control">
          <label class="label" for={`key-${index}`}>Key</label>
          <input
            id={`key-${index}`}
            type="text"
            class="input input-bordered w-full"
            bind:value={property.key}
            on:input={() => {
              if (!isValidJavascriptKey(property.key)) {
                property.key = property.key.replace(/[^a-zA-Z0-9_$]/g, '');
              }
              updateMetadata();
            }}
          />
        </div>

        <div class="form-control">
          <label class="label" for={`label-${index}`}>Label</label>
          <input
            id={`label-${index}`}
            type="text"
            class="input input-bordered w-full"
            bind:value={property.label}
            maxlength="40"
            on:input={updateMetadata}
          />
        </div>

        <div class="form-control">
          <label class="label" for={`component-${index}`}>Component</label>
          <select
            id={`component-${index}`}
            class="select select-bordered w-full"
            bind:value={property.component}
            on:change={updateMetadata}
          >
            {#each componentTypes as component}
              <option value={component}>{component}</option>
            {/each}
          </select>
        </div>

        {#if property.component === 'FormSelectField'}
          <div class="form-control col-span-2">
            <label class="label" for={`values-${index}`}>Values</label>
            <Tags
              id={`values-${index}`}
              bind:tags={property.values}
              on:tags={() => updateMetadata()}
            />
          </div>
        {:else if property.component === 'FormRangeField'}
          <div class="form-control">
            <label class="label" for={`min-${index}`}>Min</label>
            <input
              id={`min-${index}`}
              type="number"
              class="input input-bordered w-full"
              bind:value={property.min}
              on:input={updateMetadata}
            />
          </div>
          <div class="form-control">
            <label class="label" for={`max-${index}`}>Max</label>
            <input
              id={`max-${index}`}
              type="number"
              class="input input-bordered w-full"
              bind:value={property.max}
              on:input={updateMetadata}
            />
          </div>
        {/if}
      </div>

      <button
        class="btn btn-error btn-sm mt-4"
        on:click={() => removeCustomProperty(index)}
      >
        Remove
      </button>
    </div>
  {/each}

  <button class="btn btn-primary" on:click={addCustomProperty}>
    Add Custom Property
  </button>
</div>

