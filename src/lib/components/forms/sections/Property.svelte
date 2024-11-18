<script lang="ts">
import { customAlphabet } from 'nanoid';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Custom.svelte';
import PropertyFields from '$lib/components/forms/fields/Properties.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// TYPES
import type { NewProperty, SectionProps } from '$lib/types';

// CONFIG
const fieldRoot = 'properties';

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12
);

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fieldDiscriminator, fields, entity, resource } = sectionProps;

// STATE : CONTEXT
const formProps = getForm(resource, entity);
let { form } = formProps;

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
    $form[fieldRoot].unshift(newProperty);
    return $form;
  });
};

const removeAction = (e: Event, fieldIndex: number) => {
  e.preventDefault();
  form.update(($form) => {
    $form[fieldRoot].splice(fieldIndex, 1);
    return $form;
  });
  if ($form[fieldRoot].length === 0) {
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
  <Header bind:actionProps {Actions} {actions} fields={fields[fieldRoot]} {...sectionProps} />
  {#each $form[fieldRoot] as property, fieldIndex (property.id)}
    <div in:scale out:scale animate:flip={{ duration: 200 }}>
      {#if property.type === fieldDiscriminator}
        <PropertyFields
          bind:actionProps
          {actions}
          {fieldRoot}
          {fieldIndex}
          {...formProps}
          {...sectionProps}
          fields={fields[fieldRoot].discriminators.specs[fieldDiscriminator]}
        />
      {/if}
    </div>
  {/each}
</div>
