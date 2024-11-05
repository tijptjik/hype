<script lang="ts">
import { nanoid } from 'nanoid';
import { flip } from 'svelte/animate';
import { scale } from 'svelte/transition';
import { Icon } from '@steeze-ui/svelte-icon';
import { Plus } from '@steeze-ui/heroicons';
import ErrorLabel from './FormErrorLabel.svelte';
import { Bars3, Trash } from '@steeze-ui/heroicons';
import { SortableList } from '@jhubbardsf/svelte-sortablejs';
import Form from 'sveltekit-superforms';
// TYPES
import type {
  InputConstraints,
  InputConstraint,
  ValidationErrors
} from 'sveltekit-superforms';
import type { Writable } from 'svelte/store';
import type {
  ResourceType,
  FalsableRef,
  FalsableFacetType,
  FieldDiscriminator,
  LanguageTag,
  Key,
  FormFieldExtendedDefinition,
  IntermediateValue
} from '$lib/types';

// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldExtendedDefinition;
  fieldIndex: number;
  fieldDiscriminator?: FieldDiscriminator;
  fieldKey?: Key;
  complexValues: IntermediateValue[];
  form: Writable<Form>;
    constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
};

// STATE : PROPS
let {
  resourceType,
  languageTag = 'core',
  fieldId,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  complexValues,
  actions,
  field,
  form,
  constraints,
  errors
}: Props = $props();

let renderCount = $state(0);

let values = $state<IntermediateValue[]>([]);

$effect(() => {
  values = complexValues;
});

// Modify handleSort to work with intermediate state
async function handleSort(event: CustomEvent<{ oldIndex: number; newIndex: number }>) {

  // Update intermediate state
  const newValues = [...values];
  const [movedItem] = newValues.splice(event.oldIndex, 1);
  newValues.splice(event.newIndex, 0, movedItem);

  // Update ranks
  newValues.forEach((value, index) => {
    value.rank = index + 1;
  });

  values = newValues;

  // Sync back to form
  renderCount++;
  actions.syncStateToForm();
}

</script>

<div class="form-control flex w-full flex-col gap-2">
  {#if field.label}
    <div class="label">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if field.isNested}
          {$constraints?.[fieldId]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
  {/if}

  <div class="flex flex-col gap-2">
    <!-- Add Button -->
    <button class="btn btn-ghost btn-sm gap-2" onclick={actions.add}>
      <Icon src={Plus} class="h-4 w-4" />
      Add Value
    </button>
  </div>
  <!-- {#key $form[fieldId][fieldIndex][fieldKey]} -->
  {#key `${fieldId}-${fieldIndex}-${fieldKey}-${languageTag}`}
    <SortableList
      class="flex flex-col gap-0"
      animation={200}
      dataIdAttr="valueId"
      handle=".handle"
      ghostClass="bg-neutral/50"
      chosenClass="bg-neutral"
      dragClass="bg-neutral/80"
      onSort={handleSort}>
      <pre>{renderCount}</pre>
      {#each values.sort((a, b) => a.rank - b.rank) as property, index (property.id)}
        <div
          class="mt-2 flex items-center gap-4 rounded-lg border-1 border-transparent bg-base-200 p-2 font-light text-white focus-within:border-primary">
          <div class="handle cursor-grab text-neutral-content">
            <Icon src={Bars3} class="h-4 w-4" />
          </div>
          <div
            class="font-regular text-md flex-1 border-none text-white focus:border-none focus:outline-none"
            contenteditable="true"
            tabindex="0"
            data-value-id={property.id}
            data-lang={languageTag}
            bind:textContent={property[languageTag]}
            oninput={() => actions.update(fieldKey, property.id)}>
          </div>
          <div
            class="hidden cursor-pointer hover:block"
            onclick={() => actions.remove(fieldKey, item.id)}>
            <Icon src={Trash} class="h-4 w-4" />
          </div>
        </div>
      {/each}
    </SortableList>
  {/key}
  <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
</div>
