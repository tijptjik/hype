<script lang="ts">
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// STYLES
import {
  organisationHeaderStyles,
  organisationListStyles,
  organisationRowStyles,
  organisationMediaStyles,
  organisationActionsStyles,
} from '../../formOrganisationsSection/formOrganisationsSection.styles.js'
import { formSelectionSectionStyles } from '../../formSurface/formSurface.styles.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
let { count = 2 }: { count?: number } = $props()
</script>
<section
  class={`bits-form__section bits-form__parent-resource @container h-auto! pb-0! ${formSelectionSectionStyles}`}
  aria-hidden="true"
  inert
>
  <SectionHeader
    title={m.maps__organisations()}
    description={m.hub__organisations_note()}
    icon={OrganisationIcon}
    class={organisationHeaderStyles}
  >
    {#snippet right()}
      <div class="h-10 w-full max-w-96"></div>
    {/snippet}
    {#snippet afterControls()}
      <span class="inline-flex size-8 shrink-0"></span>
    {/snippet}
  </SectionHeader>
  <div class={organisationListStyles}>
    {#each Array(count) as _}
      <ResourceCard.Root class={organisationRowStyles}>
        <Skeleton class={`${organisationMediaStyles} rounded-lg`} />
        <ContentSkeleton class="min-w-0"
          ><ResourceCard.Body
            code="organisation"
            name="Organisation"
            wrapTitle
            class="min-w-0"
          /></ContentSkeleton
        >
        <ResourceCard.HubActions
          class={organisationActionsStyles}
          isEditing={false}
          canSetCoreInclusive
          isHubExclusive={false}
          isCoreInclusive
          onToggleHubExclusive={() => {}}
          onToggleCoreInclusive={() => {}}
          onRemove={() => {}}
        />
      </ResourceCard.Root>
    {/each}
  </div>
</section>
