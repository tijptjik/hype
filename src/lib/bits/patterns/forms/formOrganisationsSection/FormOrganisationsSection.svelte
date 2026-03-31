<script lang="ts">
import { slide } from 'svelte/transition'
import { Search, SectionHeader } from '$lib/bits/custom'
import { getURLfromImage } from '$lib/client/services/image'
import { m } from '$lib/i18n'
import * as FormOrganisationsSectionPrimitive from './components'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import {
  isOrganisationSearchResultDisabled,
  toOrganisationSearchDisabledMeta,
  toOrganisationSearchDiscriminator,
} from './formOrganisationsSection.utils'
import type {
  FormOrganisationsSectionProps,
  HubOrganisationItem,
  HubOrganisationSelection,
} from './formOrganisationsSection.types'

let {
  title,
  subtitle,
  organisations,
  selections,
  hiddenOrganisationInputAttrs = [],
  isEditing = true,
  isSubmitting = false,
  isSubmitRequested = false,
  startInAddingMode = false,
  canSetCoreInclusive = false,
  onSearchOrganisations,
  onAddOrganisation,
  onRemoveOrganisation,
  onToggleCoreInclusive,
  onToggleHubExclusive,
  class: className = '',
}: FormOrganisationsSectionProps = $props()

let isAdding = $state(false)
let isRemoving = $state(false)
let wasSubmitRequested = $state(false)
let hasAutoOpenedAdding = $state(false)

const selectionByOrganisationId = $derived(
  new Map(selections.map(selection => [selection.organisationId, selection])),
)
const sortedOrganisations = $derived(
  [...organisations].sort((a, b) => {
    const aName = a.i18n?.en?.name ?? a.code
    const bName = b.i18n?.en?.name ?? b.code
    return aName.localeCompare(bName)
  }),
)

const organisationIds = $derived(
  new Set(organisations.map(organisation => organisation.id)),
)
const showModeUi = $derived(isEditing && !isSubmitting)

function toImageSrc(organisation: HubOrganisationItem): string | null {
  if (!organisation.image) return null
  try {
    return getURLfromImage({
      image: organisation.image,
      transformation: 'c_fill,h_256,w_256',
    })
  } catch {
    return null
  }
}

function toSelection(organisationId: string): HubOrganisationSelection {
  return (
    selectionByOrganisationId.get(organisationId) ?? {
      organisationId,
      isCoreInclusive: true,
      isHubExclusive: false,
    }
  )
}

function toggleAdding(): void {
  isAdding = !isAdding
  if (isAdding) isRemoving = false
}

function toggleRemoving(): void {
  isRemoving = !isRemoving
  if (isRemoving) isAdding = false
}

function handleAddOrganisation(organisation: HubOrganisationItem): void {
  if (organisationIds.has(organisation.id)) return
  onAddOrganisation(organisation)
}

function handleHubExclusiveToggle(
  organisationId: string,
  nextChecked: boolean | null,
): void {
  onToggleHubExclusive(organisationId, nextChecked === true)
}

function handleCoreInclusiveToggle(
  organisationId: string,
  nextChecked: boolean | null,
): void {
  onToggleCoreInclusive(organisationId, nextChecked === true)
}

$effect(() => {
  if (!isRemoving) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isRemoving = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (!isAdding) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (sortedOrganisations.length !== 0) return
  if (!isRemoving) return
  isRemoving = false
  isAdding = true
})

$effect(() => {
  if (showModeUi) return
  isAdding = false
  isRemoving = false
})

$effect(() => {
  if (isSubmitRequested && !wasSubmitRequested) {
    isAdding = false
    isRemoving = false
  }
  wasSubmitRequested = isSubmitRequested
})

$effect(() => {
  if (hasAutoOpenedAdding) return
  if (!startInAddingMode) return
  if (!showModeUi) return
  isAdding = true
  isRemoving = false
  hasAutoOpenedAdding = true
})
</script>

<section class={`bits-form__section bits-form__parent-resource ${className}`}>
  <SectionHeader
    {title}
    description={subtitle}
    class="bits-form__parent-resource-header"
  >
    {#snippet right()}
      <FormOrganisationsSectionPrimitive.Actions
        {isAdding}
        {isRemoving}
        {isEditing}
        {isSubmitting}
        canRemove={sortedOrganisations.length > 0}
        onToggleAdding={toggleAdding}
        onToggleRemoving={toggleRemoving}
      />
    {/snippet}
  </SectionHeader>

  {#if isAdding && showModeUi}
    <div class="bits-form__parent-resource-search">
      <Search
        placeholder={m.forms__search_organisations_placeholder()}
        focusOnMount={true}
        mountTransitionDuration={showModeUi ? 80 : 0}
        onInput={onSearchOrganisations}
        excludeIds={Array.from(organisationIds)}
        getItemId={(organisation: any) => organisation.id}
        onSelect={handleAddOrganisation}
        resultMap={{
          image: (organisation: any) => toImageSrc(organisation as HubOrganisationItem),
          title: (organisation: any) =>
            organisation.i18n?.en?.name || organisation.code,
          descriminator: (organisation: any) =>
            toOrganisationSearchDiscriminator(organisation),
          disabled: (organisation: any) =>
            isOrganisationSearchResultDisabled(organisation),
          disabledMeta: (organisation: any) =>
            toOrganisationSearchDisabledMeta(organisation),
        }}
      />
    </div>
  {/if}

  {#if isRemoving && showModeUi}
    <div transition:slide={{ duration: showModeUi ? 200 : 0 }}>
      <FormOrganisationsSectionPrimitive.WarningBar />
    </div>
  {/if}

  <div class="bits-form__parent-resource-list">
    {#each sortedOrganisations as organisation (organisation.id)}
      {@const selection = toSelection(organisation.id)}
      <ResourceCard.Root>
        <ResourceCard.Media
          size="xl"
          image={toImageSrc(organisation)}
          alt={organisation.i18n?.en?.name || organisation.code}
        />
        <ResourceCard.Body
          code={organisation.code}
          name={organisation.i18n?.en?.name || organisation.code}
        />
        <ResourceCard.HubActions
          {isRemoving}
          {isEditing}
          {isSubmitting}
          {canSetCoreInclusive}
          isHubExclusive={selection.isHubExclusive}
          isCoreInclusive={selection.isCoreInclusive}
          onToggleHubExclusive={value => handleHubExclusiveToggle(organisation.id, value)}
          onToggleCoreInclusive={value =>
            handleCoreInclusiveToggle(organisation.id, value)}
          onRemove={() => onRemoveOrganisation(organisation.id)}
        />
      </ResourceCard.Root>
    {/each}
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenOrganisationInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
