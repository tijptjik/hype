<script lang="ts">
import { flip } from 'svelte/animate';
import { fade } from 'svelte/transition';
import { Icon } from '@steeze-ui/svelte-icon';
import { Plus, ExclamationTriangle } from '@steeze-ui/heroicons';
import ErrorLabel from '../labels/Error.svelte';
import { Bars3, XMark, Trash } from '@steeze-ui/heroicons';
import { draggable, droppable, type DragDropState } from '@thisux/sveltednd';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type {
  IntermediateValue,
  ListFieldProps
} from '$lib/types';

// STATE : PROPS
let fieldProps: ListFieldProps = $props();
let { resource, entity, languageTag, fieldRoot, fieldIndex, fieldKey, field, values, actions, actionProps } = fieldProps;

// STATE : CONTEXT
const { constraints, errors } = getForm(resource, entity);

let isDragging = $derived(actionProps.dragMode);

function handleDrop(state: DragDropState<IntermediateValue>) {
  const { draggedItem, targetContainer } = state;
  const dragIndex = fieldProps.values.findIndex((item: IntermediateValue) => item.id === draggedItem.id);
  const dropIndex = parseInt(targetContainer ?? '0');

  // Swap items
  if (dragIndex !== -1 && !isNaN(dropIndex)) {
    const [item] = fieldProps.values.splice(dragIndex, 1);
    fieldProps.values.splice(dropIndex, 0, item);
  }
  // Update ranks
  fieldProps.values.forEach((value, index) => {
    value.rank = index + 1;
  });
  // Sync up to form
  actions.syncUp();
}
</script>

<div class="form-control flex w-full flex-col gap-2">
  {#if field.label}
    <div class="label">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if field.isNested}
          {$constraints?.[fieldRoot]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldRoot]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
  {/if}

  <div class="flex flex-row justify-center gap-2 divide-x">
    <button class="btn btn-ghost btn-sm" onclick={actions.add}>
      <Icon src={Plus} class="h-4 w-4" />
      Add
    </button>
    <button
      class="btn btn-ghost btn-sm {actionProps.removeMode ? 'btn-error' : ''}"
      onclick={() => {
        actionProps.removeMode = !actionProps.removeMode;
        actionProps.removeModeLang = languageTag;
      }}>
      <Icon src={XMark} class="h-4 w-4" />
      {actionProps.removeMode ? 'Cancel' : 'Remove'}
    </button>
  </div>
  {#key `${fieldRoot}-${fieldIndex}-${fieldKey}-${languageTag}`}
    {#each fieldProps.values as property, index (property.id)}
      <div
        use:draggable={{
          container: index.toString(),
          dragData: property,
          callbacks: {
            onDragStart: () => {
              actionProps.dragMode = true;
            },
            onDragEnd: () => {
              actionProps.dragMode = false;
            }
          }
        }}
        use:droppable={{
          container: index.toString(),
          callbacks: {
            onDrop: handleDrop
          }
        }}
        animate:flip={{ duration: 200 }}
        in:fade={{ duration: 150 }}
        out:fade={{ duration: 150 }}
        class="svelte-dnd-touch-feedback relative mt-1 flex cursor-move items-center gap-4 rounded-lg border-1 border-transparent bg-base-200 p-2 h-14 font-light text-white transition-all duration-200 focus-within:border-primary">
        {#if actionProps.removeMode && actionProps.confirmingId === property.id && actionProps.removeModeLang === languageTag}
          <div
            class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-200 bg-opacity-80">
            <div class="flex flex-col items-center gap-4 p-4">
              <div class="flex items-center gap-2">
                <!-- <Icon src={ExclamationTriangle} class="h-8 w-8 text-error" /> -->
                <p class="text-center font-bold text-error">Are you sure?</p>
                <button
                  class="btn btn-ghost btn-sm"
                  onclick={() => {
                    actionProps.confirmingId = undefined;
                    actionProps.removeModeLang = undefined;
                  }}>
                  Cancel
                </button>
                <button
                  class="btn btn-error btn-sm"
                  onclick={(e) => {
                    actions.remove(e, property.id);
                    actionProps.confirmingId = undefined;
                    actionProps.removeModeLang = undefined;
                  }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        {/if}

        <div class="handle cursor-grab text-neutral-content">
          <Icon src={Bars3} class="h-4 w-4" />
        </div>
        <div
          class="font-regular text-md flex-1 border-none text-white focus:border-none focus:outline-none"
          contenteditable={!isDragging && !actionProps.removeMode}
          tabindex="0"
          data-value-id={property.id}
          data-lang={languageTag}
          onblur={(e) => actions.update(property.id, languageTag, e)}>
          {property[languageTag]}
        </div>
        {#if actionProps.removeMode && actionProps.removeModeLang === languageTag}
          <button
            class="btn btn-ghost btn-sm text-error"
            onclick={() => {
              actionProps.confirmingId = property.id;
              actionProps.removeModeLang = languageTag;
            }}>
            <Icon src={Trash} class="h-4 w-4" />
          </button>
        {/if}
      </div>
    {/each}
  {/key}
  <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
</div>

<style>
:global(.dragging) {
  @apply opacity-80 shadow-lg ring-2 ring-secondary;
}
</style>
