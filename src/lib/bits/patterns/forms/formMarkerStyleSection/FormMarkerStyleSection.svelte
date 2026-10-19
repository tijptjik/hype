<script lang="ts">
// BITS
import { LocalSearch, SectionHeader } from '#lib/bits/custom/index.js'
import { MapStyleCard } from '#lib/bits/patterns/cards/mapStyleCard/index.js'
import SelectionActions from '../formMapStyleSection/components/FormMapStyleSectionActions.svelte'
// STYLES
import { formSelectionSearchHeaderStyles } from '../formSurface/formSearchHeader.styles.js'
import { formSelectionSectionStyles } from '../formSurface/formSurface.styles.js'
// PRESENTATION
import {
  MARKER_STYLE_CATALOG,
  DEFAULT_MARKER_STYLE,
  type MarkerStyleCode,
} from '#lib/features/markerStyle.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { HTMLInputAttributes } from 'svelte/elements'

type MarkerOption = {
  id: string
  code: MarkerStyleCode | null
  name: string
  description: string
  preview: string
}

let {
  value = null,
  inheritedValue = null,
  isEditing = false,
  disabled = false,
  isSubmitRequested = false,
  allowInherit = false,
  inputAttrs,
  onSelect,
}: {
  value?: MarkerStyleCode | null
  inheritedValue?: MarkerStyleCode | null
  isEditing?: boolean
  disabled?: boolean
  isSubmitRequested?: boolean
  allowInherit?: boolean
  inputAttrs: HTMLInputAttributes
  onSelect: (value: MarkerStyleCode | null) => void
} = $props()

let isAdding = $state(false)
const options: MarkerOption[] = MARKER_STYLE_CATALOG.map(style => ({
  ...style,
  id: style.code,
  preview: `/markerStyles/${style.code}.svg`,
}))
const photoOption = options.find(option => option.code === DEFAULT_MARKER_STYLE)!
const inherited = $derived(
  options.find(option => option.code === inheritedValue) ?? photoOption,
)
const defaultOption = $derived<MarkerOption>({
  id: 'default',
  code: null,
  name: m.theme_map_project_default(),
  description: `Inherit the parent project’s marker style. (${inherited.name})`,
  preview: inherited.preview,
})
const choices = $derived(allowInherit ? [defaultOption, ...options] : options)
const selected = $derived(
  value === null && allowInherit
    ? defaultOption
    : (options.find(option => option.code === value) ?? photoOption),
)

/**
 * Applies the selected marker style and closes the editor.
 * @param option Registered marker style or project inheritance choice.
 * @returns Nothing; the route owns persistence through its hidden form field.
 */
function select(option: MarkerOption): void {
  onSelect(option.code)
  isAdding = false
}

$effect(() => {
  if (!isEditing || disabled || isSubmitRequested) isAdding = false
})
$effect(() => {
  if (!isAdding) return
  const close = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', close)
  return () => window.removeEventListener('keydown', close)
})
</script>

<section
  class={`bits-form__section bits-form__parent-resource ${formSelectionSectionStyles} ${isAdding ? 'relative! z-[180]!' : ''}`}
>
  <SectionHeader
    title="Marker Style"
    description={allowInherit
      ? 'Inherit the project style or choose an override.'
      : 'Choose how locations appear on the map.'}
    class={formSelectionSearchHeaderStyles}
  >
    {#snippet right()}
      {#if isAdding && isEditing}
        <div class="w-[clamp(7rem,12vw,10rem)] min-w-0">
          <LocalSearch
            options={choices}
            placeholder={m.forms__search_placeholder()}
            focusOnMount={true}
            getItemId={() => ''}
            onSelect={select}
            maxResults={choices.length}
            resultListClass="flex! flex-col! gap-1!"
            visualPreviewClass="size-24! min-w-24! border-0! [&_img]:object-contain"
            resultMap={{
              image: () => null,
              title: (option: MarkerOption) => option.name,
              descriminator: () => '',
              previewImage: (option: MarkerOption) => option.preview,
              variant: () => 'visual',
            }}
          />
        </div>
      {/if}
      <SelectionActions
        {isAdding}
        {isEditing}
        isSubmitting={disabled}
        onToggleAdding={() => (isAdding = !isAdding)}
      />
    {/snippet}
  </SectionHeader>
  <div class="bits-form__parent-resource-list">
    <MapStyleCard.Root>
      <MapStyleCard.Preview
        image={selected.preview}
        alt={selected.name}
        class="shrink-0 [&_img]:object-contain"
      />
      <MapStyleCard.Body name={selected.name} description={selected.description} />
    </MapStyleCard.Root>
  </div>
  <!-- Preserve the route-owned hidden field for preflight and server submission. -->
  <input {...inputAttrs} type="hidden">
</section>
