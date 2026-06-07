<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// I18N
import { getI18n, getLocaleKey, m } from '$lib/i18n'
// SERVICES
import {
  getClassifierValueId,
  getFeatureCardEditableProperties,
  getI18nSpecifierValue,
  getLocalisedPropertyValues,
  getUniversalSpecifierValue,
  handleCategoricalChange,
  handleSpecifierChange,
} from '$lib/client/services/property'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
// ICONS
import Check from 'virtual:icons/lucide/check'
import PencilSquare from 'virtual:icons/lucide/square-pen'
// TYPES
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Id } from '$lib/types'

type FeatureCardNewPropertiesFieldProps = {
  feature: Feature | UserContributedFeature
}

let { feature }: FeatureCardNewPropertiesFieldProps = $props()

const appCtx = getAppCtx()
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
    <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-white/48">
      Details
    </p>

    <div class="grid grid-cols-1 gap-4 w-100:grid-cols-2">
      {#each availableFeatureProperties as availableProperty (availableProperty.propertyId)}
        {@const property = availableProperty.property}
        {@const propertyId = availableProperty.propertyId}
        {#if property}
          {@const propertyValues = getLocalisedPropertyValues(appCtx, propertyId)}
          {@const displayValue = getCurrentValue(propertyId, property)}
          <div class="space-y-2">
            <span
              class="font-mono text-[11px] uppercase tracking-[0.22em] text-white/42"
            >
              {getI18n(property, 'label', userPreferences)}
            </span>

            {#if property.component === 'SelectField' && propertyValues.size > 0}
              <select
                class="h-11 w-full rounded-full border border-white/10 bg-black/25 px-4 text-sm text-white focus:border-white/28 focus:outline-none"
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
                {#each propertyValues.entries() as [ id, localisedValue ]}
                  <option value={id}>{localisedValue}</option>
                {/each}
              </select>
            {:else if property.component === 'TextareaField'}
              {#if editingStates[propertyId]}
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <textarea
                    bind:this={textareaElements[propertyId]}
                    bind:value={currentValues[propertyId]}
                    class="min-h-24 min-w-0 w-full rounded-[1.5rem] border border-white/14 bg-black/35 px-4 py-3 text-sm leading-6 text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
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
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
                    onclick={() => saveValue(propertyId, property)}
                    disabled={!(currentValues[propertyId] || '').trim()}
                  >
                    <Icon src={Check} class="h-5 w-5 text-primary" />
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="flex min-h-24 w-full items-start justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-black/35"
                  onclick={() => startEditing(propertyId, property)}
                >
                  <span
                    class={`text-sm leading-6 ${displayValue ? 'text-white/82' : 'font-semibold text-white/45'}`}
                  >
                    {displayValue ||
                      `Enter ${getI18n(property, 'label', userPreferences)}`}
                  </span>
                  <Icon src={PencilSquare} class="mt-0.5 h-5 w-5 shrink-0 text-white" />
                </button>
              {/if}
            {:else if property.component === 'InputField'}
              {#if editingStates[propertyId]}
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <input
                    bind:this={inputElements[propertyId]}
                    bind:value={currentValues[propertyId]}
                    type="text"
                    class="h-11 min-w-0 w-full rounded-full border border-white/14 bg-black/35 px-4 text-sm text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
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
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
                    onclick={() => saveValue(propertyId, property)}
                    disabled={!(currentValues[propertyId] || '').trim()}
                  >
                    <Icon src={Check} class="h-5 w-5 text-primary" />
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-black/25 px-4 text-left transition hover:bg-black/35"
                  onclick={() => startEditing(propertyId, property)}
                >
                  <span
                    class={`truncate text-sm ${displayValue ? 'text-white' : 'font-semibold text-white/45'}`}
                  >
                    {displayValue ||
                      `Enter ${getI18n(property, 'label', userPreferences)}`}
                  </span>
                  <Icon src={PencilSquare} class="h-5 w-5 shrink-0 text-white" />
                </button>
              {/if}
            {:else}
              <input
                type="text"
                class="h-11 w-full rounded-full border border-white/10 bg-black/25 px-4 text-sm text-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
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
