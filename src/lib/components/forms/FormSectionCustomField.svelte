<script lang="ts">
import { createEventDispatcher } from 'svelte';
import { nanoid } from 'nanoid';

// COMPONENTS
import Header from '$lib/components/forms/FormHeader.svelte';
import Actions from '$lib/components/forms/FormActionsCustomField.svelte';
import CustomFields from '$lib/components/forms/FormFieldCustomFields.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// TYPES
import type {
  CustomPropertyType,
  FieldComponentType,
  CustomProperty,
  ProjectMetadata,
  FormField,
  FalsableRef,
  ResourceType,
  FalsableFacetType
} from '$lib/types';

// TYPES
type Props = {
  title: string;
  subtitle: string;
  fieldId: string;
  customPropertyType: CustomPropertyType;
  fields: FormField;
  facet: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, subtitle, fieldId, customPropertyType, fields, facet, entity, resourceType }: Props = $props();

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);


const addAction = (e: Event) => {
  e.preventDefault();
  const newProperty: CustomProperty = {
    type: customPropertyType,
    key: nanoid(12),
    label: '',
    component: customPropertyType === 'classifiers' ? classifierComponentTypes[0] : specifierComponentTypes[0]
  };
  form.update(($form) => {
    $form[fieldId][customPropertyType][newProperty.key] = newProperty;
    return $form;
  });
};

const removeAction = (e: Event, key: string) => {
  e.preventDefault();
  form.update(($form) => {
    delete $form[fieldId][customPropertyType][key];
    return $form;
  });
  if (Object.keys($form[fieldId][customPropertyType]).length === 0) {
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

// function removeCustomProperty(index: number) {
//   customProperties = customProperties.filter((_, i) => i !== index);
//   updateMetadata();
// }

// function updateMetadata() {
//   metadata = customProperties.reduce((acc, prop) => {
//     if (!acc[prop.type]) acc[prop.type] = {};
//     acc[prop.type][prop.key] = prop;
//     return acc;
//   }, {} as ProjectMetadata);
//   dispatch('change', metadata);
// }


</script>

<div class="overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header
    bind:actionProps
    {title}
    {subtitle}
    {Actions}
    {actions}
    {fields}
    {resourceType}
    {errors}
    {entity} />
  <CustomFields
    bind:actionProps
    {fieldId}
    {customPropertyType}
    {fields}
    {constraints}
    {errors}
    {actions}
    {facet}
    {entity}
    {resourceType}
     />
</div>
