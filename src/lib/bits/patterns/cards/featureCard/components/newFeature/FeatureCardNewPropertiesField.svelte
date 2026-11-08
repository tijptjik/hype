<script lang="ts">
import { isRangeProperty } from '#lib/properties/range.js'
import FeatureFieldInterval from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldInterval.svelte'
import FeatureFieldLinks from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldLinks.svelte'
import { getFeatureProperty } from '#lib/client/services/property.js'
// BITS
import { Icon } from '#lib/bits/index.js'
// I18N
import { getI18n, getLocaleKey, m } from '#lib/i18n.js'
// SERVICES
import {
  getClassifierValueId,
  getFeatureCardEditableProperties,
  getI18nSpecifierValue,
  getLocalisedPropertyValues,
  getUniversalSpecifierValue,
  handleCategoricalChange,
  handleSpecifierChange,
} from '#lib/client/services/property.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
// ICONS
import Check from 'virtual:icons/proicons/checkmark'
import PencilSquare from 'virtual:icons/proicons/compose'
// TYPES
import type {
  Feature,
  UserContributedFeature,
} from '#lib/db/zod/schema/feature.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { Id } from '#lib/types.js'

type FeatureCardNewPropertiesFieldProps = {
  feature: Feature | UserContributedFeature
}

let { feature }: FeatureCardNewPropertiesFieldProps = $props()

const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const userPreferences = $derived(appCtx.getUserPreferences())
const availableFeatureProperties = $derived(
  feature?.layerId ? getFeatureCardEditableProperties(appCtx, feature.layerId) : [],
)

let editingStates = $state<Record<string, boolean>>({})
let currentValues = $state<Record<string, string>>({})
let inputElements = $state<Record<string, HTMLInputElement | null>>({})
let textareaElements = $state<Record<string, HTMLTextAreaElement | null>>({})

function getCurrentValue(propertyId: Id, property: Property): string {
  const i18nValue = getI18nSpecifierValue(appCtx, propertyId)
  const universalValue = getUniversalSpecifierValue(appCtx, propertyId)

  return property.isTranslatable ? i18nValue || '' : universalValue || ''
}

function startEditing(propertyId: Id, property: Property): void {
  currentValues[propertyId] = getCurrentValue(propertyId, property)
  editingStates[propertyId] = true

  setTimeout(() => {
    inputElements[propertyId]?.focus()
    textareaElements[propertyId]?.focus()
  }, 0)
}

function saveValue(propertyId: Id, property: Property): void {
  editingStates[propertyId] = false
  handleSpecifierChange(
    appCtx,
    propertyId,
    property.isTranslatable ? getLocaleKey() : 'core',
    currentValues[propertyId] || '',
  )
}

function cancelEditing(propertyId: Id): void {
  editingStates[propertyId] = false
}
</script>

{#if cardCtx.isNewMode && availableFeatureProperties.length > 0}
  <div class="space-y-3">
    <p class="text-muted-foreground font-mono text-[11px] tracking-[0.28em] uppercase">
      Details
    </p>

    <div class="w-100:grid-cols-2 grid grid-cols-1 gap-4">
      {#each availableFeatureProperties as availableProperty (availableProperty.propertyId)}
        {@const property = availableProperty.property}
        {@const propertyId = availableProperty.propertyId}
        {#if property}
          {@const propertyValues = getLocalisedPropertyValues(appCtx, propertyId)}
          {@const displayValue = getCurrentValue(propertyId, property)}
          <div class="space-y-2">
            <span
              class="text-muted-foreground font-mono text-[11px] tracking-[0.22em] uppercase"
            >
              {getI18n(property, 'label', userPreferences)}
            </span>

            {#if isRangeProperty(property)}
              <FeatureFieldInterval
                definition={property}
                value={getFeatureProperty(appCtx, propertyId)?.valueJson}
                onChange={value =>
                  handleSpecifierChange(appCtx, propertyId, 'core', value)}
              />
            {:else if property.dataType === 'link'}
              <FeatureFieldLinks
                value={getFeatureProperty(appCtx, propertyId)?.valueJson}
                cardinality={property.cardinality}
                onChange={value =>
                  handleSpecifierChange(appCtx, propertyId, 'core', value)}
              />
            {:else if property.component === 'SelectField' && propertyValues.size > 0}
              <select
                class="border-border-input bg-base-200 text-base-content focus:border-border-input-hover h-11 w-full rounded-full border px-4 text-sm focus:outline-none"
                value={getClassifierValueId(appCtx, propertyId)}
                onchange={event =>
                  handleCategoricalChange(
                    appCtx,
                    propertyId,
                    event.currentTarget.value,
                  )}
              >
                <option value="">
                  {getI18n(property, 'placeholder', userPreferences)}
                </option>
                {#each propertyValues.entries() as [id, localisedValue]}
                  <option value={id}>{localisedValue}</option>
                {/each}
              </select>
            {:else if property.component === 'TextareaField'}
              {#if editingStates[propertyId]}
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <textarea
                    bind:this={textareaElements[propertyId]}
                    bind:value={currentValues[propertyId]}
                    class="border-border-input bg-base-200 text-base-content caret-base-content placeholder:text-muted-foreground focus:border-border-input-hover min-h-24 w-full min-w-0 rounded-[1.5rem] border px-4 py-3 text-sm leading-6 focus:outline-none"
                    placeholder={getI18n(property, 'placeholder', userPreferences)}
                    rows="2"
                    onkeydown={event => {
                      event.stopPropagation()
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        saveValue(propertyId, property)
                      }
                      if (event.key === 'Escape') cancelEditing(propertyId)
                      if (event.key === 'Tab') saveValue(propertyId, property)
                    }}
                    onblur={() => saveValue(propertyId, property)}
                  ></textarea>
                  <button
                    type="button"
                    class="border-border-input bg-base-content/8 text-base-content hover:bg-base-content/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
                    onclick={() => saveValue(propertyId, property)}
                    disabled={!(currentValues[propertyId] || '').trim()}
                  >
                    <Icon src={Check} class="text-primary h-5 w-5" />
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="border-border-input bg-base-200 hover:bg-base-300 flex min-h-24 w-full items-start justify-between gap-3 rounded-[1.5rem] border px-4 py-3 text-left transition"
                  onclick={() => startEditing(propertyId, property)}
                >
                  <span
                    class={`text-sm leading-6 ${displayValue ? 'text-muted-foreground' : 'text-muted-foreground font-semibold'}`}
                  >
                    {displayValue ||
                      `Enter ${getI18n(property, 'label', userPreferences)}`}
                  </span>
                  <Icon
                    src={PencilSquare}
                    class="text-base-content mt-0.5 h-5 w-5 shrink-0"
                  />
                </button>
              {/if}
            {:else if property.component === 'InputField'}
              {#if editingStates[propertyId]}
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <input
                    bind:this={inputElements[propertyId]}
                    bind:value={currentValues[propertyId]}
                    type="text"
                    class="border-border-input bg-base-200 text-base-content caret-base-content placeholder:text-muted-foreground focus:border-border-input-hover h-11 w-full min-w-0 rounded-full border px-4 text-sm focus:outline-none"
                    placeholder={getI18n(property, 'placeholder', userPreferences)}
                    onkeydown={event => {
                      event.stopPropagation()
                      if (event.key === 'Enter') saveValue(propertyId, property)
                      if (event.key === 'Escape') cancelEditing(propertyId)
                      if (event.key === 'Tab') saveValue(propertyId, property)
                    }}
                    onblur={() => saveValue(propertyId, property)}
                  >
                  <button
                    type="button"
                    class="border-border-input bg-base-content/8 text-base-content hover:bg-base-content/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
                    onclick={() => saveValue(propertyId, property)}
                    disabled={!(currentValues[propertyId] || '').trim()}
                  >
                    <Icon src={Check} class="text-primary h-5 w-5" />
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="border-border-input bg-base-200 hover:bg-base-300 flex h-11 w-full items-center justify-between gap-3 rounded-full border px-4 text-left transition"
                  onclick={() => startEditing(propertyId, property)}
                >
                  <span
                    class={`!block min-w-0 flex-1 overflow-hidden text-sm text-ellipsis whitespace-nowrap ${displayValue ? 'text-base-content' : 'text-muted-foreground font-semibold'}`}
                  >
                    {displayValue ||
                      `Enter ${getI18n(property, 'label', userPreferences)}`}
                  </span>
                  <Icon src={PencilSquare} class="text-base-content h-5 w-5 shrink-0" />
                </button>
              {/if}
            {:else}
              <input
                type="text"
                class="border-border-input bg-base-200 text-base-content placeholder:text-muted-foreground focus:border-border-input-hover h-11 w-full rounded-full border px-4 text-sm focus:outline-none"
                value={getUniversalSpecifierValue(appCtx, propertyId)}
                placeholder={m.key_full_raven_wish()}
                onchange={event =>
                  handleCategoricalChange(
                    appCtx,
                    propertyId,
                    event.currentTarget.value,
                  )}
              >
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
