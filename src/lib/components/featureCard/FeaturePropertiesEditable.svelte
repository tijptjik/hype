<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Check, PencilSquare } from '@steeze-ui/heroicons';
// I18N
import { getI18n, getLocale } from '$lib/i18n';
// SERVICES
import { 
  getUserContributableProperties,
  getPropertyValues,
  getUniversalSpecifierValue,
  getI18nSpecifierValue,
  getCategoricalValueId,
  handleCategoricalChange,
  handleSpecifierChange,
} from '$lib/client/services/property';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
// TYPES
import type {
  Feature,
  LocaleExtended,
  UserContributedFeature,
  Id,
} from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// STATE : CONTEXT
const appCtx = getAppCtx();
const cardCtx = getFeatureCardContext();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// STATE : LOCAL EDITING
let editingStates = $state<Record<string, boolean>>({});
let originalValues = $state<Record<string, string>>({});
let currentValues = $state<Record<string, string>>({});
let inputElements = $state<Record<string, HTMLInputElement>>({});
let textareaElements = $state<Record<string, HTMLTextAreaElement>>({});

// FUNCTIONS
// Available properties that could be added to the feature
const availableFeatureProperties = $derived(
  feature?.layerId ? getUserContributableProperties(appCtx, feature.layerId) : []
);

// Get available property values for dropdowns (categorical options) from cache
function getPropertyValuesForComponent(
  propertyId: Id
): { readonly value: string; readonly id: string }[] {
  if (!cardCtx.isNewMode) {
    return [];
  }
  return getPropertyValues(appCtx, propertyId);
}

// Helper functions that use the service functions
function getUniversalSpecifierValueForComponent(propertyId: Id): string | undefined {
  return getUniversalSpecifierValue(appCtx, propertyId);
}

function getI18nSpecifierValueForComponent(propertyId: Id): string | undefined {
  return getI18nSpecifierValue(appCtx, propertyId);
}

function getCategoricalValueIdForComponent(propertyId: Id): string | undefined {
  return getCategoricalValueId(appCtx, propertyId);
}

/**
 * Handle categorical property change
 * @param propertyId - The ID of the property to change
 * @param propertyValueId - The id of the property value to change to
 */
function handleCategoricalChangeForComponent(propertyId: Id, propertyValueId: Id) {
  handleCategoricalChange(appCtx, propertyId, propertyValueId);
}

/**
 * Handle specifier property change (i18n values)
 * @param propertyId - The ID of the property to change
 * @param locale - The locale of the property to change ('core' for universal specifier)
 * @param newValue - The new value of the property
 */
function handleSpecifierChangeForComponent(
  propertyId: Id,
  locale: LocaleExtended,
  newValue: string
) {
  handleSpecifierChange(appCtx, propertyId, locale, newValue);
}

// EDIT MODE HANDLERS
function getCurrentValue(propertyId: string, prop: any): string {
  const translatable = prop.isTranslatable;
  const i18nValue = getI18nSpecifierValueForComponent(propertyId);
  const universalValue = getUniversalSpecifierValueForComponent(propertyId);
  const result = translatable ? i18nValue || '' : universalValue || '';

  return result;
}

function handleInputEditMode(propertyId: string, prop: any) {
  const value = getCurrentValue(propertyId, prop);
  originalValues[propertyId] = value;
  currentValues[propertyId] = value;
  editingStates[propertyId] = true;
  setTimeout(() => {
    inputElements[propertyId]?.focus();
  }, 0);
}

function handleTextareaEditMode(propertyId: string, prop: any) {
  const value = getCurrentValue(propertyId, prop);
  originalValues[propertyId] = value;
  currentValues[propertyId] = value;
  editingStates[propertyId] = true;
  setTimeout(() => {
    textareaElements[propertyId]?.focus();
  }, 0);
}

function handleInputSubmit(propertyId: string, prop: any) {
  editingStates[propertyId] = false;
  handleSpecifierChangeForComponent(
    propertyId,
    prop.isTranslatable ? getLocale() : 'core',
    currentValues[propertyId] || ''
  );
}

function handleTextareaSubmit(propertyId: string, prop: any) {
  editingStates[propertyId] = false;
  handleSpecifierChangeForComponent(
    propertyId,
    prop.isTranslatable ? getLocale() : 'core',
    currentValues[propertyId] || ''
  );
}

function handleEditCancel(propertyId: string) {
  editingStates[propertyId] = false;
  // Reset to original value would need to be handled in the parent component
}
</script>

{#if cardCtx.isNewMode && availableFeatureProperties.length > 0}
  <div
    class="flex-grow-1 flex min-h-8 w-full flex-shrink-0 flex-col bg-black caret-transparent">
    <div
      class="justify-flex-start dir-rtl pointer-events-auto mt-2 grid grid-cols-1 gap-2 pl-3 pr-3 w-100:grid-cols-2 w-100:pl-6 w-100:pr-6 w-120:gap-4">
      {#if cardCtx.isNewMode}
        {#each availableFeatureProperties as { property: prop, propertyId, value, i18n } (propertyId)}
          {#if prop}
            {@const propertyValues = getPropertyValuesForComponent(propertyId)}
            <div class="dir-ltr flex flex-col justify-evenly gap-1">
              <span
                class="font-mono text-xs font-normal uppercase tracking-wide text-gray-400">
                {getI18n(prop, 'label', userPreferences)}
              </span>
              <!-- Error message placeholder (for future use) -->
              <div class="min-h-0"></div>
              {#if prop.component === 'SelectField' && propertyValues.length > 0}
                <!-- SelectField Component: Dropdown -->
                <select
                  class="select select-sm w-full border-none bg-black pl-0 focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0"
                  value={getCategoricalValueIdForComponent(propertyId)}
                  onchange={(e) =>
                    handleCategoricalChangeForComponent(propertyId, e.currentTarget.value)}>
                  <option value=""
                    >{getI18n(prop, 'placeholder', userPreferences)}</option>
                  {#each propertyValues as option}
                    <option value={option.id}>{option.value}</option>
                  {/each}
                </select>
              {:else if prop.component === 'TextareaField'}
                <!-- TextareaField Component: Textarea with click-to-edit -->
                {@const displayValue = getCurrentValue(propertyId, prop)}
                {#if editingStates[propertyId]}
                  <div class="flex items-center gap-1">
                    <div
                      class="
                        text-md
                        grid
                        w-full
                        after:invisible
                        after:whitespace-pre-wrap
                        after:border
                        after:px-3.5
                        after:py-3
                        after:text-inherit
                        after:content-[attr(data-cloned-val)_'_']
                        after:[grid-area:1/1/2/2]
                        [&>textarea]:resize-y
                        [&>textarea]:overflow-hidden
                        [&>textarea]:text-inherit
                        [&>textarea]:[grid-area:1/1/2/2]
                    ">
                      <textarea
                        class="text-md textarea textarea-bordered -ml-3 mt-1.5 w-full resize-y rounded-lg bg-black px-3.5 py-2.5 caret-white outline-none"
                        bind:this={textareaElements[propertyId]}
                        bind:value={currentValues[propertyId]}
                        placeholder={getI18n(prop, 'placeholder', userPreferences)}
                        rows="1"
                        onkeydown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            handleTextareaSubmit(propertyId, prop);
                          } else if (e.key === 'Escape') {
                            handleEditCancel(propertyId);
                          } else if (e.key === 'Tab') {
                            handleTextareaSubmit(propertyId, prop);
                          }
                        }}
                        onfocus={(e) => {
                          const parent = e.currentTarget.parentElement as HTMLElement;
                          if (parent) {
                            parent.dataset.clonedVal = e.currentTarget.value;
                          }
                        }}
                        oninput={(e) => {
                          // Update the cloned value for auto-growth
                          const parent = e.currentTarget.parentElement as HTMLElement;
                          if (parent) {
                            parent.dataset.clonedVal = e.currentTarget.value;
                          }
                        }}
                        onblur={() => handleTextareaSubmit(propertyId, prop)}
                      ></textarea>
                    </div>
                    <button
                      class="btn btn-ghost btn-sm -mr-1 rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
                      onclick={() => handleTextareaSubmit(propertyId, prop)}
                      disabled={!(currentValues[propertyId] || '').trim()}>
                      <Icon src={Check} class="h-5 w-5" />
                    </button>
                  </div>
                {:else}
                  <div
                    class="pointer-events-auto flex min-h-14 cursor-pointer items-center justify-between rounded py-1 hover:bg-base-100/5"
                    onclick={() => handleTextareaEditMode(propertyId, prop)}>
                    <p class="flex-1 text-sm">
                      {displayValue ||
                        `Enter ${getI18n(prop, 'label', userPreferences)}`}
                    </p>
                    <button
                      class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-2 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:bg-base-200">
                      <Icon src={PencilSquare} class="h-5 w-5" />
                    </button>
                  </div>
                {/if}
              {:else if prop.component === 'InputField'}
                <!-- InputField Component: Input with click-to-edit -->
                {@const displayValue = getCurrentValue(propertyId, prop)}
                {#if editingStates[propertyId]}
                  <div class="-ml-3 flex items-center gap-1">
                    <input
                      type="text"
                      class="input input-bordered mt-1.5 max-h-8 w-full bg-black caret-white focus:outline-none"
                      bind:value={currentValues[propertyId]}
                      bind:this={inputElements[propertyId]}
                      placeholder={getI18n(prop, 'placeholder', userPreferences)}
                      onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          handleInputSubmit(propertyId, prop);
                        } else if (e.key === 'Escape') {
                          handleEditCancel(propertyId);
                        } else if (e.key === 'Tab') {
                          handleInputSubmit(propertyId, prop);
                        }
                      }}
                      onblur={() => handleInputSubmit(propertyId, prop)} />
                    <button
                      class="btn btn-ghost btn-sm -mr-1 rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
                      onclick={() => handleInputSubmit(propertyId, prop)}
                      disabled={!(currentValues[propertyId] || '').trim()}>
                      <Icon src={Check} class="h-5 w-5" />
                    </button>
                  </div>
                {:else}
                  <div
                    class="pointer-events-auto flex cursor-pointer items-center justify-between rounded py-1 hover:bg-base-100/5"
                    onclick={() => handleInputEditMode(propertyId, prop)}>
                    <span class="flex-1 text-sm text-white">
                      {displayValue ||
                        `Enter ${getI18n(prop, 'label', userPreferences)}`}
                    </span>
                    <button
                      class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-2 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200">
                      <Icon src={PencilSquare} class="h-5 w-5" />
                    </button>
                  </div>
                {/if}
              {:else}
                <!-- Fallback: Generic text input -->
                <input
                  type="text"
                  class="input input-sm input-bordered w-full"
                  value={getUniversalSpecifierValueForComponent(propertyId)}
                  placeholder="Enter value..."
                  onchange={(e) =>
                    handleCategoricalChangeForComponent(propertyId, e.currentTarget.value)} />
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
{/if}
