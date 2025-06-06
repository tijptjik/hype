<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate';
import { fade } from 'svelte/transition';
import { draggable, droppable } from '@thisux/sveltednd';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Plus, Bars3, XMark, Trash } from '@steeze-ui/heroicons';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
// TYPES
import type { DragDropState } from '@thisux/sveltednd';
import type { IntermediateValue, ListFieldProps, Locale } from '$lib/types';

// STATE : PROPS
let fieldProps: ListFieldProps = $props();
let { locale, fieldRoot, fieldIndex, fieldKey, field, actions, actionProps } =
  fieldProps;

// STATE : FORM
const { constraints, errors } = fieldProps.form;

let isDragging = $derived(actionProps.dragMode);

function handleDrop(state: DragDropState<IntermediateValue>) {
  const { draggedItem, targetContainer } = state;
  const dragIndex = fieldProps.values.findIndex(
    (item: IntermediateValue) => item.id === draggedItem.id
  );
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

<div class="form-control flex w-full flex-col gap-2 caret-transparent">
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
    <button
      class="btn btn-ghost btn-sm"
      onclick={actions.add}
      disabled={actionProps.removeMode}>
      <Icon src={Plus} class="h-4 w-4" />
      {m.wacky_home_sawfish_accept()}
    </button>
    <button
      class="btn btn-ghost btn-sm {actionProps.removeMode ? 'btn-error' : ''}"
      onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        actionProps.removeMode = !actionProps.removeMode;
        actionProps.removeModeLocale = locale;
      }}>
      <Icon src={XMark} class="h-4 w-4" />
      {actionProps.removeMode
        ? m.green_short_pelican_fall()
        : m.watery_trite_shrimp_clip()}
    </button>
  </div>
  {#key `${fieldRoot}-${fieldIndex}-${fieldKey}-${locale}`}
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
        class="svelte-dnd-touch-feedback relative mt-1 flex h-14 cursor-move items-center gap-4 rounded-lg border-1 border-transparent bg-base-200 p-2 font-light text-white transition-all duration-200 focus-within:border-primary">
        {#if actionProps.removeMode && actionProps.confirmingId === property.id && actionProps.removeModeLocale === locale}
          <div
            class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-200 bg-opacity-80">
            <div class="flex flex-col items-center gap-4 p-4">
              <div class="flex items-center gap-2">
                <!-- <Icon src={ExclamationTriangle} class="h-8 w-8 text-error" /> -->
                <p class="text-center font-bold text-error">
                  {m.curly_bland_crab_arrive()}
                </p>
                <button
                  class="btn btn-ghost btn-sm"
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    actionProps.confirmingId = undefined;
                  }}>
                  {m.green_short_pelican_fall()}
                </button>
                <button
                  class="btn btn-error btn-sm"
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.remove(e, property.id);
                    actionProps.confirmingId = undefined;
                  }}>
                  {m.whole_deft_penguin_enchant()}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <div class="handle cursor-grab text-neutral-content">
          <Icon src={Bars3} class="h-4 w-4" />
        </div>
        <div
          class="font-regular text-md flex-1 border-none text-white focus:border-none focus:outline-none caret-white"
          contenteditable={!isDragging && !actionProps.removeMode}
          tabindex="0"
          data-value-id={property.id}
          data-lang={locale}
          onblur={(e) => actions.update(e, property.id, locale as Locale)}>
          {property[locale]}
        </div>
        {#if actionProps.removeMode && actionProps.removeModeLocale === locale}
          <button
            class="btn btn-ghost btn-sm text-error"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              actionProps.confirmingId = property.id;
              actionProps.removeModeLocale = locale as Locale;
            }}>
            <Icon src={Trash} class="h-4 w-4" />
          </button>
        {/if}
      </div>
    {/each}
  {/key}
  <ErrorLabel {errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} />
</div>

<style>
:global(.dragging) {
  @apply opacity-80 shadow-lg ring-2 ring-accent;
}
</style>
