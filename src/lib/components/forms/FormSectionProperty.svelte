<script lang="ts">
import { nanoid } from 'nanoid';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// COMPONENTS
import Header from '$lib/components/forms/FormHeader.svelte';
import Actions from '$lib/components/forms/FormActionsCustomField.svelte';
import PropertyFields from '$lib/components/forms/FormFieldProperties.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// TYPES
import type { Writable } from 'svelte/store';
import type Form from 'sveltekit-superforms';
import type {
  FormFieldArray,
  FalsableRef,
  ResourceType,
  FalsableFacetType,
  IntermediateValue,
  NewPropertyValue,
  NewProperty,
  Organisation,
  Project,
  Layer,
  Feature
} from '$lib/types';
import { setForm } from '$lib/context/forms.svelte';
import type { ValidationErrors, InputConstraints, InputConstraint } from 'sveltekit-superforms';

// TYPES
type Props = {
  title: string;
  subtitle: string;
  fieldId: string;
  fieldDiscriminator: string;
  fields: FormFieldArray;
  facet: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, subtitle, fieldId, fieldDiscriminator, fields, facet, entity, resourceType }: Props =
  $props();

// STATE

// STATE : CONTEXT
type getFormType = ReturnType<typeof setForm<Project>>;

const { form, errors, constraints }: getFormType = getForm(resourceType, entity);

// ***
// PROPERTY FIELDS
// ***

const addAction = (e: Event, projectId: string) => {
  e.preventDefault();
  const newProperty: NewProperty = {
    projectId: projectId,
    type: fieldDiscriminator as 'classifier' | 'specifier',
    key: nanoid(12),
    label: '',
    component:
      fieldDiscriminator === 'classifier'
        ? classifierComponentTypes[0]
        : specifierComponentTypes[0],
    values: [],
    translations: {
      'zh-hant': '',
      'zh-hans': ''
    }
  };
  form.update(($form) => {
    $form[fieldId].push(newProperty);
    return $form;
  });
};

const removeAction = (e: Event, id: string) => {
  e.preventDefault();
  form.update(($form) => {
    const index = $form[fieldId].findIndex((property) => property.id === id);
    if (index !== -1) {
      $form[fieldId].splice(index, 1);
    }
    return $form;
  });
  if ($form[fieldId].length === 0) {
    actionProps.removeMode = false;
  }
};

const updateAction = () => {
  console.log('updateAction');
};

const actions = {
  add: addAction,
  remove: removeAction,
  update: updateAction
};

let actionProps = $state({
  searchMode: false,
  removeMode: false,
  confirmationMode: false,
  confirmingId: undefined
});

// ***
// COMPLEX FIELDS
// ***

// Add state management for complex fields
let complexValues = $state<Record<string, IntermediateValue[]>>({});

// Add sync functions
function syncFormToState(propertyId: string) {
  const formValues: Record<string, NewPropertyValue[]> = {};

  for (const key of $form[fieldId]) {
    formValues[key.id] = key.values;
  }

  if (!formValues) return;

  complexValues[propertyId] = formValues[propertyId].map((v) => ({
    id: v.id,
    rank: v.rank,
    en: v.value,
    enGen: v.valueGen,
    'zh-hans': v.translations['zh-hans'].value,
    'zh-hansGen': v.translations['zh-hans'].valueGen,
    'zh-hant': v.translations['zh-hant'].value,
    'zh-hantGen': v.translations['zh-hant'].valueGen
  }));
}

function syncStateToForm(propertyId: string) {
  const values = complexValues[propertyId];
  if (!values) return;

  form.update(($form) => {
    const propertyValues = values.map((v) => ({
      id: v.id,
      propertyId: propertyId,
      value: v.en,
      valueGen: v.enGen,
      rank: v.rank,
      translations: {
        'zh-hant': {
          propertyValueId: v.id,
          lang: 'zh-hant',
          value: v['zh-hant'],
          valueGen: v['zh-hantGen']
        },
        'zh-hans': {
          propertyValueId: v.id,
          lang: 'zh-hans',
          value: v['zh-hans'],
          valueGen: v['zh-hansGen']
        }
      }
    }));

    // Get the index of the property with the correct propertyId
    const index = $form[fieldId].findIndex((prop) => prop.id === propertyId);
    if (index !== -1) {
      $form[fieldId][index].values = propertyValues;
    }

    return $form;
  });
}

const addValue = (propertyId: string) => {
  console.log('addValue', propertyId);
  complexValues[propertyId].push({
    id: nanoid(12),
    rank: complexValues[propertyId].length + 1,
    en: '',
    enGen: false,
    'zh-hans': '',
    'zh-hansGen': false,
    'zh-hant': '',
    'zh-hantGen': false
  });
};

const removeValue = (propertyId: string, valueId: string) => {
  console.log('removeValue', propertyId, valueId);
};

const updateValue = (propertyId: string, valueId: string) => {
  console.log('updateValue', propertyId, valueId);
};

const complexActions = {
  add: addValue,
  remove: removeValue,
  update: updateValue
};

let complexActionProps = $state({
  searchMode: false,
  removeMode: false
});
</script>

<div class="overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header
    bind:actionProps
    {title}
    {subtitle}
    {Actions}
    {actions}
    fields={fields[fieldId]}
    {form}
    {constraints}
    {errors}
    {facet}
    {entity}
    {resourceType} />
  {#each $form[fieldId] as property, fieldIndex (property.id)}
    <div in:scale out:scale animate:flip={{ duration: 200 }}>
      {#if property.type === fieldDiscriminator}
        <PropertyFields
          bind:actionProps
          {fieldId}
          {fieldIndex}
          {fieldDiscriminator}
          fields={fields[fieldId].discriminators.specs[fieldDiscriminator]}
          complexValues={complexValues[property.id]}
          {complexActionProps}
          {complexActions}
          {constraints}
          {errors}
          {facet}
          {entity}
          {resourceType} />
      {/if}
    </div>
  {/each}
</div>
