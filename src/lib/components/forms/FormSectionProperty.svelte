<script lang="ts">
import { customAlphabet } from 'nanoid';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';

// COMPONENTS
import Header from '$lib/components/forms/FormHeader.svelte';
import Actions from '$lib/components/forms/FormActionsCustomField.svelte';
import PropertyFields from '$lib/components/forms/FormFieldProperties.svelte';
// CONTEXT
import { setForm, getForm } from '$lib/context/forms.svelte';
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
import type { ValidationErrors, InputConstraints, InputConstraint } from 'sveltekit-superforms';

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12
);

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

const addAction = async (e: Event) => {
  e.preventDefault();
  const id = nanoid();
  const newProperty: NewProperty = {
    id: id,
    projectId: $form.id,
    type: fieldDiscriminator as 'classifier' | 'specifier',
    key: id,
    label: '',
    labelGen: false,
    placeholder: '',
    placeholderGen: false,
    component:
      fieldDiscriminator === 'classifier'
        ? classifierComponentTypes[0]
        : specifierComponentTypes[0],
    values: [],
    translations: {
      'zh-hant': {
        lang: 'zh-hant',
        propertyId: id,
        label: '',
        labelGen: false,
        placeholder: '',
        placeholderGen: false
      },
      'zh-hans': {
        lang: 'zh-hans',
        propertyId: id,
        label: '',
        labelGen: false,
        placeholder: '',
        placeholderGen: false
      }
    }
  };
  form.update(($form) => {
    $form[fieldId].unshift(newProperty);
    return $form;
  });
};

const removeAction = (e: Event, fieldIndex: number) => {
  e.preventDefault();
  form.update(($form) => {
    $form[fieldId].splice(fieldIndex, 1);
    return $form;
  });
  if ($form[fieldId].length === 0) {
    actionProps.removeMode = false;
  }
};

const actions = {
  add: addAction,
  remove: removeAction
};

let actionProps = $state({
  searchMode: false,
  removeMode: false,
  confirmationMode: false,
  confirmingId: undefined
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
          {actions}
          {fieldId}
          {fieldIndex}
          {fieldDiscriminator}
          fields={fields[fieldId].discriminators.specs[fieldDiscriminator]}
          {constraints}
          {errors}
          {facet}
          {entity}
          {resourceType} />
      {/if}
    </div>
  {/each}
</div>
