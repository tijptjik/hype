<script lang="ts">
// COMPONENTS
import { SimpleTooltip } from '#lib/bits/core/index.js'
import {
  Search,
  SectionHeader,
  SectionHeaderPrimitive,
} from '#lib/bits/custom/index.js'
import { getURLfromImage } from '#lib/client/services/image.js'
import { m } from '#lib/i18n.js'
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
// STYLES
import {
  organisationHeaderStyles,
  organisationListStyles,
  organisationRowStyles,
  organisationMediaStyles,
  organisationActionsStyles,
} from './formOrganisationsSection.styles'
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
  issues = [],
  organisations,
  selections,
  hiddenOrganisationInputAttrs = [],
  isEditing = true,
  isSubmitting = false,
  canSetCoreInclusive = false,
  onSearchOrganisations,
  onAddOrganisation,
  onRemoveOrganisation,
  onToggleCoreInclusive,
  onToggleHubExclusive,
  class: className = '',
}: FormOrganisationsSectionProps = $props()

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
</script>

<section
  class={`bits-form__section bits-form__parent-resource @container h-auto! pb-0! ${className}`}
>
  <SectionHeader
    {title}
    icon={OrganisationIcon}
    description={subtitle}
    class={organisationHeaderStyles}
  >
    {#snippet right()}
      <div class="flex w-full min-w-0 flex-wrap items-center justify-end gap-3">
        <SectionHeaderPrimitive.Issues {issues} />
        <!-- Retain the search footprint when viewing to keep the header and rows stable. -->
        <div
          class="w-full max-w-96 min-w-0 flex-1 basis-64 transition-opacity duration-180 ease-in-out motion-reduce:transition-none"
          style:opacity={isEditing ? 1 : 0}
          inert={!showModeUi}
          aria-hidden={!isEditing}
        >
          <Search
            placeholder={m.forms__search_organisations_placeholder()}
            focusOnMount={false}
            mountTransitionDuration={0}
            onInput={onSearchOrganisations}
            excludeIds={Array.from(organisationIds)}
            getItemId={(organisation: HubOrganisationItem) => organisation.id}
            onSelect={handleAddOrganisation}
            resultMap={{
              image: (organisation: HubOrganisationItem) => toImageSrc(organisation),
              title: (organisation: HubOrganisationItem) =>
                organisation.i18n?.en?.name || organisation.code,
              descriminator: toOrganisationSearchDiscriminator,
              disabled: isOrganisationSearchResultDisabled,
              disabledMeta: toOrganisationSearchDisabledMeta,
            }}
          />
        </div>
      </div>
    {/snippet}
    {#snippet afterControls()}
      <SimpleTooltip
        triggerProps={{ 'aria-label': 'About map sharing', role: 'button' }}
      >
        {#snippet trigger()}
          <span
            class="text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center"
          >
            <InfoIcon class="size-4" aria-hidden="true" />
          </span>
        {/snippet}
        <p class="mb-3 font-semibold">Map sharing</p>
        <ul class="space-y-3">
          <li>
            <strong class="font-semibold">List on HYPE.hk</strong>
            <p>Share your map with others through HYPE.hk.</p>
          </li>
          <li>
            <strong class="font-semibold">Hub Exclusive</strong>
            <p>
              Only offer your map through your own domain. Your map won't be recommended
              on HYPE.hk.
            </p>
          </li>
        </ul>
      </SimpleTooltip>
    {/snippet}
  </SectionHeader>

  <div class={organisationListStyles}>
    {#each sortedOrganisations as organisation (organisation.id)}
      {@const selection = toSelection(organisation.id)}
      <ResourceCard.Root class={organisationRowStyles}>
        <ResourceCard.Media
          size="xl"
          class={organisationMediaStyles}
          image={toImageSrc(organisation)}
          alt={organisation.i18n?.en?.name || organisation.code}
        />
        <ResourceCard.Body
          code={organisation.code}
          name={organisation.i18n?.en?.name || organisation.code}
          wrapTitle
          class="min-w-0"
        />
        <ResourceCard.HubActions
          class={organisationActionsStyles}
          {isEditing}
          {isSubmitting}
          {canSetCoreInclusive}
          isHubExclusive={selection.isHubExclusive}
          isCoreInclusive={selection.isCoreInclusive}
          onToggleHubExclusive={value =>
            handleHubExclusiveToggle(organisation.id, value)}
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
