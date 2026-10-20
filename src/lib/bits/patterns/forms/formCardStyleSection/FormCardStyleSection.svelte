<script lang="ts">
// BITS
import { LocalSearch, SectionHeader } from '#lib/bits/custom/index.js'
import { MapStyleCard } from '#lib/bits/patterns/cards/mapStyleCard/index.js'
import SelectionActions from '../formMapStyleSection/components/FormMapStyleSectionActions.svelte'
// STYLES
import { formSelectionSearchHeaderStyles } from '../formSurface/formSearchHeader.styles.js'
import { formSelectionSectionStyles } from '../formSurface/formSurface.styles.js'
// CATALOGUE
import {
  CARD_STYLE_CATALOG,
  DEFAULT_CARD_STYLE,
  resolveCardStyle,
} from '#lib/features/cardStyle.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { CardStyleCode } from '#lib/features/cardStyle.js'

type StyleOption = {
  id: string
  code: CardStyleCode | ''
  name: string
  description: string
  preview: string
}
let {
  value = DEFAULT_CARD_STYLE,
  allowInherit = false,
  inheritedValue = DEFAULT_CARD_STYLE,
  isEditing = false,
  isSubmitting = false,
  isSubmitRequested = false,
  inputAttrs,
  onSelect,
}: {
  value?: CardStyleCode | null
  allowInherit?: boolean
  inheritedValue?: CardStyleCode | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  inputAttrs: import('svelte/elements').HTMLInputAttributes
  onSelect: (code: CardStyleCode | null) => void
} = $props()

let isAdding = $state(false)
const options = $derived<StyleOption[]>(
  CARD_STYLE_CATALOG.map(style => ({
    id: style.code,
    code: style.code,
    name:
      style.code === 'breadline'
        ? m.card_style__breadline()
        : style.code === 'flexible'
          ? m.card_style__flexible()
          : style.code === 'full'
            ? m.card_style__full()
            : m.card_style__no_description(),
    description:
      style.code === 'breadline'
        ? m.card_style__breadline_description()
        : style.code === 'flexible'
          ? m.card_style__flexible_description()
          : style.code === 'full'
            ? m.card_style__full_description()
            : m.card_style__no_description_description(),
    preview: style.preview,
  })),
)
const defaultOption = $derived(
  options.find(option => option.code === DEFAULT_CARD_STYLE)!,
)
const inherited = $derived(
  options.find(option => option.code === resolveCardStyle(inheritedValue)) ??
    defaultOption,
)
const inheritOption = $derived<StyleOption>({
  id: 'inherit',
  code: '',
  name: m.card_style__inherit(),
  description: `${m.card_style__inherit_description()} (${inherited.name})`,
  preview: inherited.preview,
})
const choices = $derived(allowInherit ? [inheritOption, ...options] : options)
const selected = $derived(
  value
    ? (options.find(option => option.code === value) ?? defaultOption)
    : allowInherit
      ? inheritOption
      : defaultOption,
)

/**
 * Applies a controlled selection and closes the picker.
 * @param option Registered style or project inheritance option.
 * @returns Nothing; the parent form owns persistence.
 */
function select(option: StyleOption): void {
  onSelect(option.code || null)
  isAdding = false
}

$effect(() => {
  if (!isEditing || isSubmitting || isSubmitRequested) isAdding = false
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
    title={m.card_style__title()}
    description={allowInherit
      ? m.card_style__layer_description()
      : m.card_style__project_description()}
    class={formSelectionSearchHeaderStyles}
  >
    {#snippet right()}
      {#if isAdding && isEditing}
        <div class="w-[clamp(7rem,16vw,12rem)] min-w-0">
          <LocalSearch
            options={choices}
            placeholder={m.forms__search_placeholder()}
            focusOnMount={true}
            onSelect={select}
            maxResults={choices.length}
            resultListClass="flex! flex-col! gap-1!"
            visualResultItemClass={String.raw`[&_.bits-search-result-item\_\_title]:whitespace-normal! [&_.bits-search-result-item\_\_title]:overflow-visible! [&_.bits-search-result-item\_\_title]:text-clip! [&_.bits-search-result-item\_\_title]:break-words`}
            visualPreviewClass="size-24! min-w-24! border-0! [&_img]:object-contain"
            resultMap={{
              image: () => null,
              title: (option: StyleOption) => option.name,
              descriminator: () => '',
              previewImage: (option: StyleOption) => option.preview,
              variant: () => 'visual',
            }}
          />
        </div>
      {/if}
      <SelectionActions
        {isAdding}
        {isEditing}
        {isSubmitting}
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
  <!-- The route supplies .as('hidden', value) attributes so SvelteKit can bind
       and decode this field during client preflight and server submission. -->
  <input {...inputAttrs}>
</section>
