<script lang="ts">
import { nanoid } from 'nanoid';
import Form from 'sveltekit-superforms';
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import { Icon } from '@steeze-ui/svelte-icon';
import { Trash } from '@steeze-ui/heroicons';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import SelectField from '$lib/components/forms/FormFieldSelect.svelte';
import TagField from '$lib/components/forms/FormFieldTags.svelte';
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';

// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type {
  ResourceType,
  FalsableRef,
  FormField,
  FalsableFacetType,
  CustomPropertyType,
} from '$lib/types';

type Props = {
  fieldId: string;
  fields: FormField;
  customPropertyType: CustomPropertyType;
  form: Form;
  constraints: InputConstraints<Record<string, InputConstraint>>;
  errors: ValidationErrors<Record<string, string>>;
  userJoinStateKey: string;
  checkedValue: string;
  uncheckedValue: string;
  actionProps: {
    searchMode: boolean;
    removeMode: boolean;
  };
  actions: Record<string, () => void>;
  facet: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let {
  fieldId,
  customPropertyType,
  fields,
  constraints,
  errors,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false
  }),
  facet,
  entity,
  resourceType,
  actions
}: Props = $props();

// CONTEXT
const { form, validate } = getForm(resourceType, entity);

// UTILS
function isValidJavascriptKey(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}
</script>

<div class="grid min-h-32 grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
  {#each Object.entries($form[fieldId][customPropertyType]) as [key, property], index (key)}
    <div
      in:scale
      out:scale
      animate:flip={{ duration: 200 }}
      class="relative rounded-lg bg-base-200 p-4">
      {#if actionProps.removeMode}
        <div
          class="absolute right-0 top-0 h-full w-full rounded-lg bg-base-200 p-4 opacity-50 hover:opacity-70"
          onclick={(e) => actions.remove(e, key)}>
          <Icon src={Trash} class="m-auto w-8 shrink-0 stroke-current opacity-100" />
        </div>
      {/if}
      <div class="grid grid-cols-1 gap-4">
        <InputField
          {resourceType}
          {entity}
          facet="config"
          fieldId="metadata"
          field={{ label: 'Name in API', component: InputField }}
          {form}
          {constraints}
          {errors}
          {customPropertyType}
          customProperty={key}
          customPropertyKey={'key'} />

        <InputField
          {resourceType}
          facet="config"
          fieldId="metadata"
          field={{ label: 'Name in App', component: InputField }}
          {form}
          {constraints}
          {errors}
          {customPropertyType}
          customProperty={key}
          customPropertyKey={'label'} />

        <SelectField
          {resourceType}
          facet="config"
          fieldId="metadata"
          field={{ label: 'Component', component: SelectField }}
          {form}
          {constraints}
          {errors}
          {customPropertyType}
          customProperty={key}
          customPropertyKey={'component'}
          values={property.type === 'classifiers' ? classifierComponentTypes : specifierComponentTypes}
           /> 

        {#if property.component === 'SelectField'}
          <TagField
          {resourceType}
          facet="config"
          fieldId="metadata"
          field={{ label: 'Values', component: TagField }}
          {form}
          {constraints}
          {errors}
          {customPropertyType}
          customProperty={key}
          customPropertyKey={'values'}
          />

        {:else if property.component === 'RangeField'}
          <div class="grid grid-cols-2 gap-4">
              <InputField
              {resourceType}
              {entity}
              facet="config"
              fieldId="metadata"
            field={{ label: 'Min', component: InputField }}
            {form}
            {constraints}
            {errors}
            {customPropertyType}
            customProperty={key}
            customPropertyKey={'min'}
            inputType="number" />

            <InputField
            {resourceType}
            {entity}
            facet="config"
            fieldId="metadata"
            field={{ label: 'Max', component: InputField }}
            {form}
            {constraints}
            {errors}
            {customPropertyType}
            customProperty={key}
            customPropertyKey={'max'}
            inputType="number" />
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>
