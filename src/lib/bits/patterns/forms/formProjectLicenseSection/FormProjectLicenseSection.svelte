<script lang="ts">
import { Dialog } from 'bits-ui'
import { Button, SimpleTooltip } from '$lib/bits/core'
import { Card, SectionHeader } from '$lib/bits/custom'
import { LicenseCard } from '$lib/bits/patterns/cards/licenseCard'
import { m } from '$lib/i18n'
import {
  buildProjectLicense,
  createDefaultProjectLicense,
  getProjectLicenseIntent,
  type ProjectLicenseIntent,
} from '$lib/client/services/licence'
import {
  inferProjectLicenseRightsFromLabel,
  isRecognizedPublicDomainLicenseLabel,
  isKnownGeneratedProjectLicenseLabel,
} from '$lib/db/services/licence'
import type { Component } from 'svelte'
import BrainIcon from 'virtual:icons/lucide/brain'
import BinaryIcon from 'virtual:icons/lucide/binary'
import ImageIcon from 'virtual:icons/lucide/image'
import PenToolIcon from 'virtual:icons/lucide/pen-tool'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import RotateCcwIcon from 'virtual:icons/lucide/rotate-ccw'
import XIcon from 'virtual:icons/lucide/x'
import CopyrightLineIcon from 'virtual:icons/mingcute/copyright-line'
import CcByIcon from 'virtual:icons/cib/creative-commons-by'
import CcNcIcon from 'virtual:icons/cib/creative-commons-nc'
import CcPdAltIcon from 'virtual:icons/cib/creative-commons-pd-alt'
import CcSaIcon from 'virtual:icons/cib/creative-commons-sa'
import type {
  ProjectLicense,
  ProjectLicenseMediaType,
  ProjectLicenseRights,
} from '$lib/types'
import type { LicenseCardCondition } from '$lib/bits/patterns/cards/licenseCard'
import type {
  FormProjectLicenseCustomLabels,
  FormProjectLicenseLeafMediaType,
  FormProjectLicenseSectionProps,
} from './formProjectLicenseSection.types'

type WizardStep = 1 | 2 | 3 | 4

type LicenseSummaryMedia = {
  key: ProjectLicenseMediaType
  label: string
  icon: Component<Record<string, unknown>>
}

const mediaConfigByType: Record<ProjectLicenseMediaType, LicenseSummaryMedia> = {
  all: { key: 'all', label: m.admin__project_license_media_all(), icon: BrainIcon },
  image: {
    key: 'image',
    label: m.admin__project_license_media_image(),
    icon: ImageIcon,
  },
  text: {
    key: 'text',
    label: m.admin__project_license_media_text(),
    icon: PenToolIcon,
  },
  data: { key: 'data', label: m.admin__project_license_media_data(), icon: BinaryIcon },
}

const orderedLeafMediaTypes: FormProjectLicenseLeafMediaType[] = [
  'text',
  'image',
  'data',
]

const conditionConfig = {
  publicDomain: {
    key: 'publicDomain',
    label: m.admin__project_license_condition_public_domain(),
    description: m.admin__project_license_condition_public_domain_description(),
    icon: CcPdAltIcon,
  },
  allRightsReserved: {
    key: 'allRightsReserved',
    label: m.admin__project_license_condition_all_rights_reserved(),
    description: m.admin__project_license_condition_all_rights_reserved_description(),
    icon: CopyrightLineIcon,
  },
  BY: {
    key: 'BY',
    label: 'BY',
    description: m.admin__project_license_condition_by_description(),
    icon: CcByIcon,
  },
  SA: {
    key: 'SA',
    label: 'SA',
    description: m.admin__project_license_condition_sa_description(),
    icon: CcSaIcon,
  },
  NC: {
    key: 'NC',
    label: 'NC',
    description: m.admin__project_license_condition_nc_description(),
    icon: CcNcIcon,
  },
} as const satisfies Record<
  'publicDomain' | 'allRightsReserved' | 'BY' | 'SA' | 'NC',
  LicenseCardCondition
>

let {
  title,
  subtitle,
  attributionPlaceholder = m.admin__project_license_attribution_placeholder(),
  attributionHint = m.admin__project_license_attribution_hint(),
  license,
  rightRows,
  leafMediaTypes,
  useCustomLicenseLabels,
  customLicenseLabels,
  isEditing = true,
  isSubmitting = false,
  class: className = '',
  onApplyLicense,
}: FormProjectLicenseSectionProps = $props()

let isWizardOpen = $state(false)
let wizardStep = $state<WizardStep>(1)
let draftIntent = $state<ProjectLicenseIntent>('conditional')
let draftAllMediaSameRights = $state(true)
let draftRights = $state<Record<ProjectLicenseMediaType, ProjectLicenseRights>>(
  createDefaultProjectLicense().media,
)
let standardDraftRights = $state<Record<ProjectLicenseMediaType, ProjectLicenseRights>>(
  createDefaultProjectLicense().media,
)
let draftUseCustomLicenseLabels = $state(false)
let draftCustomLicenseLabels = $state<FormProjectLicenseCustomLabels>({
  text: '',
  image: '',
  data: '',
})
let draftAttribution = $state('')

const rootClass = $derived(
  ['bits-license', 'bits-form__section', className].filter(Boolean).join(' '),
)
const sortedLeafMediaTypes = $derived.by(() =>
  orderedLeafMediaTypes.filter(mediaType => leafMediaTypes.includes(mediaType)),
)
const displayedMedia = $derived.by(() =>
  license.meta.allMediaSameRights
    ? [mediaConfigByType.all]
    : sortedLeafMediaTypes.map(mediaType => mediaConfigByType[mediaType]),
)
const shouldShowCustomLicenseNames = $derived(
  useCustomLicenseLabels &&
    !license.meta.isPublicDomain &&
    !license.meta.isAllRightsReserved,
)
const summaryLicenseLabelByMedia = $derived.by(() => ({
  all:
    useCustomLicenseLabels &&
    customLicenseLabels.text.trim() &&
    customLicenseLabels.text.trim() === customLicenseLabels.image.trim() &&
    customLicenseLabels.text.trim() === customLicenseLabels.data.trim()
      ? customLicenseLabels.text.trim()
      : license.media.all.license,
  text: useCustomLicenseLabels
    ? customLicenseLabels.text.trim() || license.media.text.license
    : license.media.text.license,
  image: useCustomLicenseLabels
    ? customLicenseLabels.image.trim() || license.media.image.license
    : license.media.image.license,
  data: useCustomLicenseLabels
    ? customLicenseLabels.data.trim() || license.media.data.license
    : license.media.data.license,
}))
const standardGeneratedLicense = $derived.by(() =>
  buildProjectLicense({
    attribution: draftAttribution,
    intent: draftIntent,
    allMediaSameRights: draftAllMediaSameRights,
    rights: toStandardRights(draftRights),
    useCustomLabels: false,
    customLabels: {},
  }),
)
const generatedLicense = $derived.by(() =>
  buildProjectLicense({
    attribution: draftAttribution,
    intent: draftIntent,
    allMediaSameRights: draftAllMediaSameRights,
    rights: draftUseCustomLicenseLabels ? draftRights : toStandardRights(draftRights),
    useCustomLabels: draftUseCustomLicenseLabels,
    customLabels: draftCustomLicenseLabels,
  }),
)
const previewMedia = $derived.by(() =>
  standardGeneratedLicense.meta.allMediaSameRights
    ? [mediaConfigByType.all]
    : sortedLeafMediaTypes.map(mediaType => mediaConfigByType[mediaType]),
)
const standardLicensePreviewRows = $derived.by(() =>
  standardGeneratedLicense.meta.allMediaSameRights
    ? [
        {
          key: 'text-images',
          label: m.admin__project_license_standard_text_and_images(),
          license: standardGeneratedLicense.media.text.license,
        },
        {
          key: 'data',
          label: m.admin__project_license_media_data(),
          license: standardGeneratedLicense.media.data.license,
        },
      ]
    : previewMedia.map(media => ({
        key: media.key,
        label: media.label,
        license: standardGeneratedLicense.media[media.key].license,
      })),
)
const attributionPromptTitle = $derived.by(() => {
  if (draftIntent === 'publicDomain') {
    return m.admin__project_license_prompt_public_domain_name()
  }

  if (draftIntent === 'allRightsReserved') {
    return m.admin__project_license_prompt_copyright_owner()
  }

  return m.admin__project_license_prompt_credit()
})

const standardLicenseUrlByLabel: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'ODC-By': 'https://opendatacommons.org/licenses/by/1-0/',
  'ODC-ODbL': 'https://opendatacommons.org/licenses/odbl/1-0/',
  PDDL: 'https://opendatacommons.org/licenses/pddl/1-0/',
}

/**
 * Resolves the official text URL for a standard generated license label.
 *
 * @param licenseLabel - Generated license label shown in step 3.
 * @returns Official license URL when known, otherwise `null`.
 */
function getStandardLicenseUrl(licenseLabel: string): string | null {
  return standardLicenseUrlByLabel[licenseLabel] ?? null
}

/**
 * Resolves the label applied by the step-3 preset shortcuts.
 *
 * @param mediaType - Leaf media scope being updated.
 * @param preset - Preset legal mode selected by the user.
 * @returns Canonical label to persist for the preset.
 */
function getPresetLicenseLabel(
  mediaType: FormProjectLicenseLeafMediaType,
  preset: 'publicDomain' | 'allRightsReserved',
): string {
  if (preset === 'publicDomain') {
    return mediaType === 'data' ? 'PDDL' : 'CC0'
  }

  return 'Copyright'
}

/**
 * Clones the full media-rights map so draft updates stay immutable.
 *
 * @param source - Source media-rights payload.
 * @returns Shallow-cloned rights map for every media scope.
 */
function cloneRights(
  source: ProjectLicense['media'],
): Record<ProjectLicenseMediaType, ProjectLicenseRights> {
  return {
    all: { ...source.all },
    image: { ...source.image },
    text: { ...source.text },
    data: { ...source.data },
  }
}

/**
 * Clears wizard-inaccessible preset flags from a rights map.
 *
 * @param source - Source media-rights payload.
 * @returns Rights map normalized for the standard-license flow.
 */
function toStandardRights(
  source: Record<ProjectLicenseMediaType, ProjectLicenseRights>,
): Record<ProjectLicenseMediaType, ProjectLicenseRights> {
  return {
    all: {
      ...source.all,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    },
    image: {
      ...source.image,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    },
    text: {
      ...source.text,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    },
    data: {
      ...source.data,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    },
  }
}

/**
 * Synchronizes the draft rights structure to the current same/different scope mode.
 *
 * @param source - Source rights map to reshape.
 * @param allMediaSameRights - Whether the `all` scope should drive every leaf media scope.
 * @returns Rights map normalized for the active scope mode.
 */
function syncRightsForScopeMode(
  source: Record<ProjectLicenseMediaType, ProjectLicenseRights>,
  allMediaSameRights: boolean,
): Record<ProjectLicenseMediaType, ProjectLicenseRights> {
  const nextRights = cloneRights(source)

  if (allMediaSameRights) {
    // Mirror the shared matrix state into every leaf media scope so step 3 reads one coherent shape.
    const sharedSource = sortedLeafMediaTypes[0]
      ? nextRights[sortedLeafMediaTypes[0]]
      : nextRights.all
    const sharedRights = {
      ...nextRights.all,
      BY: true,
      SA: sharedSource.SA,
      NC: sharedSource.NC,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    }

    nextRights.all = sharedRights
    for (const mediaType of sortedLeafMediaTypes) {
      nextRights[mediaType] = {
        ...nextRights[mediaType],
        BY: true,
        SA: sharedRights.SA,
        NC: sharedRights.NC,
        ND: null,
        isPublicDomain: false,
        isAllRightsReserved: false,
      }
    }

    return nextRights
  }

  nextRights.all = {
    ...nextRights.all,
    BY: true,
    ND: null,
    isPublicDomain: false,
    isAllRightsReserved: false,
  }

  for (const mediaType of sortedLeafMediaTypes) {
    nextRights[mediaType] = {
      ...nextRights[mediaType],
      BY: true,
      ND: null,
      isPublicDomain: false,
      isAllRightsReserved: false,
    }
  }

  return nextRights
}

/**
 * Switches the draft between shared and per-media scope mode.
 *
 * @param nextValue - Desired scope mode.
 */
function setDraftAllMediaSameRights(nextValue: boolean): void {
  draftAllMediaSameRights = nextValue
  draftRights = syncRightsForScopeMode(draftRights, nextValue)
}

/**
 * Opens the wizard and seeds it from the current saved license state.
 */
function openWizard(): void {
  syncDraftFromLicense()
  wizardStep = 1
  isWizardOpen = true
}

/**
 * Rehydrates local wizard draft state from the current component props.
 */
function syncDraftFromLicense(): void {
  draftIntent = getProjectLicenseIntent(license)
  draftAllMediaSameRights = license.meta.allMediaSameRights
  draftRights = syncRightsForScopeMode(
    cloneRights(license.media),
    license.meta.allMediaSameRights,
  )
  standardDraftRights = toStandardRights(
    syncRightsForScopeMode(cloneRights(license.media), license.meta.allMediaSameRights),
  )
  draftUseCustomLicenseLabels = useCustomLicenseLabels
  draftCustomLicenseLabels = {
    text: customLicenseLabels.text,
    image: customLicenseLabels.image,
    data: customLicenseLabels.data,
  }
  draftAttribution = license.meta.attribution
}

/**
 * Resets the wizard to the default conditional configuration.
 */
function restartWizard(): void {
  draftIntent = 'conditional'
  draftAllMediaSameRights = true
  draftRights = syncRightsForScopeMode(cloneRights(license.media), true)
  standardDraftRights = cloneRights(draftRights)
  draftRights.all = { ...draftRights.all, BY: true, SA: true, NC: false, ND: false }
  draftRights.image = { ...draftRights.image, BY: true, SA: true, NC: false, ND: false }
  draftRights.text = { ...draftRights.text, BY: true, SA: true, NC: false, ND: false }
  draftRights.data = { ...draftRights.data, BY: true, SA: true, NC: false, ND: false }
  draftUseCustomLicenseLabels = false
  draftCustomLicenseLabels = { text: '', image: '', data: '' }
  draftAttribution = attributionPlaceholder
  wizardStep = 1
}

/**
 * Resolves the card conditions shown for one media scope in the summary view.
 *
 * @param input - License payload to inspect.
 * @param mediaType - Media scope being rendered.
 * @returns Card conditions derived from the effective rights state.
 */
function toConditions(
  input: ProjectLicense,
  mediaType: ProjectLicenseMediaType,
): LicenseCardCondition[] {
  const rights = input.media[mediaType]
  if (rights.isPublicDomain || input.meta.isPublicDomain)
    return [conditionConfig.publicDomain]
  if (rights.isAllRightsReserved || input.meta.isAllRightsReserved) {
    return [conditionConfig.allRightsReserved]
  }

  return (['BY', 'SA', 'NC'] as const)
    .filter(key => rights[key] === true)
    .map(key => conditionConfig[key])
}

/**
 * Updates the selected top-level wizard intent.
 *
 * @param intent - New intent selected in step 1.
 */
function setDraftIntent(intent: ProjectLicenseIntent): void {
  draftIntent = intent
  if (intent === 'conditional') {
    // Drop hidden preset flags when re-entering the conditional flow from PD/ARR presets.
    draftRights = syncRightsForScopeMode(
      toStandardRights(cloneRights(draftRights)),
      draftAllMediaSameRights,
    )
    standardDraftRights = toStandardRights(cloneRights(draftRights))
    return
  }

  if (intent !== 'conditional') {
    draftUseCustomLicenseLabels = false
  }
}

/**
 * Enters custom-license mode while preserving the last standard rights snapshot.
 */
function enableDraftCustomLicenses(): void {
  standardDraftRights = toStandardRights(cloneRights(draftRights))
  draftUseCustomLicenseLabels = true
}

/**
 * Restores the last standard rights snapshot and exits custom-license mode.
 */
function enableDraftStandardLicenses(): void {
  draftRights = toStandardRights(standardDraftRights)
  draftUseCustomLicenseLabels = false
}

/**
 * Moves from step 2 into step 3 using a fresh standard-license baseline.
 */
function enterStep3FromStep2(): void {
  const nextStandardRights = toStandardRights(
    syncRightsForScopeMode(cloneRights(draftRights), draftAllMediaSameRights),
  )

  standardDraftRights = cloneRights(nextStandardRights)
  draftRights = cloneRights(nextStandardRights)
  draftUseCustomLicenseLabels = false
}

/**
 * Applies one of the custom step-3 preset shortcuts to the targeted media scope.
 *
 * @param mediaType - Leaf media scope being updated.
 * @param preset - Preset legal mode selected by the user.
 */
function applyDraftCustomPreset(
  mediaType: FormProjectLicenseLeafMediaType,
  preset: 'publicDomain' | 'allRightsReserved',
): void {
  const targets: ProjectLicenseMediaType[] = draftAllMediaSameRights
    ? ['all', ...sortedLeafMediaTypes]
    : [mediaType]

  const nextRights = cloneRights(draftRights)
  const nextLabels = { ...draftCustomLicenseLabels }

  for (const target of targets) {
    const targetMediaType = target === 'all' ? mediaType : target
    const isPublicDomain = preset === 'publicDomain'

    nextRights[target] = {
      ...nextRights[target],
      license: getPresetLicenseLabel(
        targetMediaType as FormProjectLicenseLeafMediaType,
        preset,
      ),
      isPublicDomain,
      isAllRightsReserved: !isPublicDomain,
      BY: isPublicDomain ? false : null,
      SA: isPublicDomain ? false : true,
      NC: isPublicDomain ? false : true,
      ND: isPublicDomain ? false : true,
    }

    if (target !== 'all') {
      nextLabels[target] = getPresetLicenseLabel(
        target as FormProjectLicenseLeafMediaType,
        preset,
      )
    }
  }

  draftRights = nextRights
  draftCustomLicenseLabels = nextLabels
}

/**
 * Updates one custom license label and infers rights when the label matches a known standard license.
 *
 * @param mediaType - Leaf media scope being updated.
 * @param value - Raw user-entered label.
 */
function handleDraftCustomLabelInput(
  mediaType: FormProjectLicenseLeafMediaType,
  value: string,
): void {
  const inferredRights = inferProjectLicenseRightsFromLabel(mediaType, value)

  draftCustomLicenseLabels = {
    ...draftCustomLicenseLabels,
    [mediaType]: value,
  }

  draftRights = {
    ...draftRights,
    ...(draftAllMediaSameRights
      ? {
          all: {
            ...draftRights.all,
            ...(inferredRights
              ? inferredRights
              : {
                  isPublicDomain: false,
                  isAllRightsReserved: false,
                }),
          },
        }
      : {}),
    [mediaType]: {
      ...draftRights[mediaType],
      ...(inferredRights
        ? inferredRights
        : {
            isPublicDomain: false,
            isAllRightsReserved: false,
          }),
    },
  }
}

/**
 * Updates one editable right from the step-2 matrix.
 *
 * @param mediaType - Media scope being updated.
 * @param key - Rights key toggled by the user.
 * @param checked - Next boolean value from the checkbox.
 */
function toggleDraftRight(
  mediaType: ProjectLicenseMediaType,
  key: 'BY' | 'SA' | 'NC' | 'ND',
  checked: boolean,
): void {
  if (key === 'BY') return

  const nextRights = cloneRights(draftRights)

  nextRights[mediaType] = {
    ...nextRights[mediaType],
    BY: true,
    isPublicDomain: false,
    isAllRightsReserved: false,
    [key]: checked,
  }

  if (draftAllMediaSameRights && mediaType === 'all') {
    for (const leafMediaType of sortedLeafMediaTypes) {
      nextRights[leafMediaType] = {
        ...nextRights[leafMediaType],
        BY: true,
        isPublicDomain: false,
        isAllRightsReserved: false,
        [key]: checked,
      }
    }
  }

  draftRights = nextRights
}

/**
 * Advances the wizard to the next step.
 */
function handleNext(): void {
  if (wizardStep === 1) {
    wizardStep = draftIntent === 'conditional' ? 2 : 4
    return
  }

  if (wizardStep === 2) {
    enterStep3FromStep2()
    wizardStep = 3
    return
  }

  if (wizardStep === 3) {
    wizardStep = 4
    return
  }
}

/**
 * Moves the wizard to the previous step.
 */
function handleBack(): void {
  if (wizardStep === 4) {
    wizardStep = draftIntent === 'conditional' ? 3 : 1
    return
  }

  if (wizardStep === 3) {
    enableDraftStandardLicenses()
    wizardStep = 2
    return
  }

  if (wizardStep === 2) {
    wizardStep = 1
  }
}

/**
 * Finalizes the local draft and emits it back to the project page form state.
 */
function applyDraftLicense(): void {
  const nextLicense = buildProjectLicense({
    attribution: draftAttribution,
    intent: draftIntent,
    allMediaSameRights: draftAllMediaSameRights,
    rights: draftUseCustomLicenseLabels ? draftRights : toStandardRights(draftRights),
    useCustomLabels: draftUseCustomLicenseLabels,
    customLabels: draftCustomLicenseLabels,
  })

  onApplyLicense({
    license: {
      ...nextLicense,
      meta: {
        ...nextLicense.meta,
        attribution: draftAttribution.trim() || attributionPlaceholder || '',
        history: license.meta.history ?? [],
      },
    },
    useCustomLicenseLabels: draftUseCustomLicenseLabels,
    customLicenseLabels: draftCustomLicenseLabels,
  })
  isWizardOpen = false
}

$effect(() => {
  if (isWizardOpen) return
  syncDraftFromLicense()
})

$effect(() => {
  if (wizardStep === 3 && draftUseCustomLicenseLabels) return
  standardDraftRights = toStandardRights(cloneRights(draftRights))
})
</script>

<section class={rootClass}>
  <SectionHeader {title} description={subtitle}>
    {#snippet right()}
      {#if isEditing}
        <div
          class="bits-form__section-header-actions inline-flex w-auto flex-row items-center justify-end gap-0"
        >
          <Button
            text={m.admin__project_license_replace()}
            style="ghost"
            color="light"
            size="sm"
            hideLabel={true}
            hideLabelInstantly={true}
            iconComponent={ReplaceIcon}
            disabled={isSubmitting}
            onClick={openWizard}
            class="bits-form__parent-resource-replace-btn whitespace-nowrap h-10"
          />
        </div>
      {/if}
    {/snippet}
  </SectionHeader>

  <Card.Wrapper class="bits-license__cards">
    {#each displayedMedia as media (media.key)}
      <LicenseCard
        mediaLabel={media.label}
        mediaLicense={summaryLicenseLabelByMedia[media.key]}
        mediaIcon={media.icon}
        attribution={license.meta.attribution}
        conditions={toConditions(license, media.key)}
        showLicenseName={shouldShowCustomLicenseNames &&
          !isKnownGeneratedProjectLicenseLabel(summaryLicenseLabelByMedia[media.key])}
        isPublicDomain={license.media[media.key].isPublicDomain ||
          (shouldShowCustomLicenseNames &&
            isRecognizedPublicDomainLicenseLabel(summaryLicenseLabelByMedia[media.key]))}
        isAllRightsReserved={license.media[media.key].isAllRightsReserved}
      />
    {/each}
  </Card.Wrapper>

  <Dialog.Root bind:open={isWizardOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="bits-dialog__overlay" />
      <Dialog.Content class="bits-dialog__content bits-theme bits-license__dialog">
        <div class="bits-license__dialog-header">
          <Dialog.Title class="bits-license__dialog-title">
            {m.admin__project_license_picker_title()}
          </Dialog.Title>
          <div class="bits-license__dialog-topbar">
            <Button
              text={m.admin__project_license_restart()}
              size="sm"
              style="ghost"
              color="light"
              iconComponent={RotateCcwIcon}
              onClick={restartWizard}
            />
            <Button
              text={m.admin__project_license_close()}
              size="sm"
              style="ghost"
              color="light"
              iconComponent={XIcon}
              onClick={() => {
                isWizardOpen = false
              }}
            />
          </div>
        </div>

        {#if wizardStep === 1}
          <div class="bits-license__wizard">
            <div
              class="bits-license__prompt-block bits-license__prompt-block--centered"
            >
              <h3 class="bits-license__prompt-title">
                {m.admin__project_license_step1_question()}
              </h3>
            </div>

            <div class="bits-license__intent-grid">
              <p
                class="bits-license__intent-heading bits-license__intent-grid-heading bits-license__intent-grid-heading--no"
              >
                {m.admin__project_license_no()}
              </p>
              <div class="bits-license__intent-grid-divider" aria-hidden="true"></div>
              <p
                class="bits-license__intent-heading bits-license__intent-grid-heading bits-license__intent-grid-heading--yes"
              >
                {m.admin__project_license_yes()}
              </p>

              <div class="bits-license__intent-grid-spacer" aria-hidden="true"></div>
              <p class="bits-license__intent-subheading">
                {m.admin__project_license_some_conditions()}
              </p>
              <div
                class="bits-license__intent-option-divider"
                style="height:117%"
                aria-hidden="true"
              ></div>
              <p class="bits-license__intent-subheading">
                {m.admin__project_license_no_conditions()}
              </p>

              <button
                type="button"
                class={[
                  'bits-license__choice-card',
                  'bits-license__choice-card--large',
                  'bits-license__choice-card--centered',
                  draftIntent === 'allRightsReserved' ? 'bits-license__choice-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onclick={() => setDraftIntent('allRightsReserved')}
              >
                <span class="bits-license__choice-title"
                  >{m.admin__project_license_condition_all_rights_reserved()}</span
                >
              </button>

              <button
                type="button"
                class={[
                  'bits-license__choice-card',
                  'bits-license__choice-card--large',
                  'bits-license__choice-card--centered',
                  draftIntent === 'conditional' ? 'bits-license__choice-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onclick={() => setDraftIntent('conditional')}
              >
                <span class="bits-license__choice-title"
                  >{m.admin__project_license_permissive()}</span
                >
              </button>

              <div
                class="bits-license__intent-option-divider"
                style="height:113%"
                aria-hidden="true"
              ></div>

              <button
                type="button"
                class={[
                  'bits-license__choice-card',
                  'bits-license__choice-card--large',
                  'bits-license__choice-card--centered',
                  draftIntent === 'publicDomain' ? 'bits-license__choice-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onclick={() => setDraftIntent('publicDomain')}
              >
                <span class="bits-license__choice-title"
                  >{m.admin__project_license_condition_public_domain()}</span
                >
              </button>

              <span
                class="bits-license__choice-description bits-license__choice-description--centered"
              >
                {m.admin__project_license_step1_all_rights_reserved_description()}
              </span>
              <span
                class="bits-license__choice-description bits-license__choice-description--centered"
              >
                {m.admin__project_license_step1_permissive_description()}
              </span>
              <div class="bits-license__intent-option-divider" aria-hidden="true"></div>
              <span
                class="bits-license__choice-description bits-license__choice-description--centered"
              >
                {m.admin__project_license_step1_public_domain_description()}
              </span>
            </div>
          </div>
        {/if}

        {#if wizardStep === 2}
          <div class="bits-license__wizard">
            <div
              class="bits-license__prompt-block bits-license__prompt-block--centered"
            >
              <h3 class="bits-license__prompt-title">
                {m.admin__project_license_step2_question()}
              </h3>
              <div
                class="bits-license__binary-choice bits-license__binary-choice--narrow"
              >
                <button
                  type="button"
                  class={[
                    'bits-license__choice-card',
                    'bits-license__choice-card--compact',
                    'bits-license__choice-card--large',
                    'bits-license__choice-card--centered',
                    draftAllMediaSameRights ? 'bits-license__choice-card--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onclick={() => setDraftAllMediaSameRights(true)}
                >
                  <span class="bits-license__choice-title"
                    >{m.admin__project_license_same()}</span
                  >
                </button>
                <div
                  class="bits-license__binary-choice-divider"
                  aria-hidden="true"
                ></div>
                <button
                  type="button"
                  class={[
                    'bits-license__choice-card',
                    'bits-license__choice-card--compact',
                    'bits-license__choice-card--large',
                    'bits-license__choice-card--centered',
                    !draftAllMediaSameRights ? 'bits-license__choice-card--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onclick={() => setDraftAllMediaSameRights(false)}
                >
                  <span class="bits-license__choice-title"
                    >{m.admin__project_license_different()}</span
                  >
                </button>
              </div>
            </div>

            <div class="bits-license__rights-matrix-wrap">
              <div
                class="bits-license__rights-matrix"
                data-same={draftAllMediaSameRights}
              >
                <div
                  class="bits-license__rights-cell bits-license__rights-cell--spacer"
                  aria-hidden="true"
                ></div>
                {#if draftAllMediaSameRights}
                  <div
                    class="bits-license__rights-cell bits-license__rights-cell--media"
                    aria-hidden="true"
                  ></div>
                  <div
                    class="bits-license__rights-cell bits-license__rights-cell--media"
                  >
                    <span class="bits-license__table-head-label"
                      >{m.admin__project_license_all_caps()}</span
                    >
                  </div>
                  <div
                    class="bits-license__rights-cell bits-license__rights-cell--media"
                    aria-hidden="true"
                  ></div>
                {:else}
                  {#each sortedLeafMediaTypes as mediaType}
                    <div
                      class="bits-license__rights-cell bits-license__rights-cell--media"
                    >
                      <SimpleTooltip>
                        {#snippet trigger()}
                          <span
                            class="bits-license__table-head-icon"
                            aria-label={mediaConfigByType[mediaType].label}
                          >
                            {#if mediaType === 'image'}
                              <ImageIcon />
                            {:else if mediaType === 'text'}
                              <PenToolIcon />
                            {:else}
                              <BinaryIcon />
                            {/if}
                          </span>
                        {/snippet}
                        <span>{mediaConfigByType[mediaType].label}</span>
                      </SimpleTooltip>
                    </div>
                  {/each}
                {/if}
                <div
                  class="bits-license__rights-cell bits-license__rights-cell--spacer"
                  aria-hidden="true"
                ></div>

                {#each rightRows as rightRow}
                  <div
                    class="bits-license__rights-cell bits-license__rights-cell--label bits-license__table-key--icon"
                  >
                    <span class="bits-license__table-key-icon">
                      {#if rightRow.key === 'BY'}
                        <CcByIcon />
                      {:else if rightRow.key === 'SA'}
                        <CcSaIcon />
                      {:else}
                        <CcNcIcon />
                      {/if}
                    </span>
                    <span>{rightRow.label}</span>
                  </div>

                  {#if draftAllMediaSameRights}
                    <div
                      class="bits-license__rights-cell bits-license__rights-cell--toggle"
                      aria-hidden="true"
                    ></div>
                    <div
                      class="bits-license__rights-cell bits-license__rights-cell--toggle"
                    >
                      <input
                        type="checkbox"
                        class="bits-license__checkbox"
                        checked={draftRights.all[rightRow.key] === true || rightRow.key === 'BY'}
                        disabled={rightRow.key === 'BY'}
                        onchange={event =>
                          toggleDraftRight(
                            'all',
                            rightRow.key,
                            (event.currentTarget as HTMLInputElement).checked,
                          )}
                      >
                    </div>
                    <div
                      class="bits-license__rights-cell bits-license__rights-cell--toggle"
                      aria-hidden="true"
                    ></div>
                  {:else}
                    {#each sortedLeafMediaTypes as mediaType}
                      <div
                        class="bits-license__rights-cell bits-license__rights-cell--toggle"
                      >
                        <input
                          type="checkbox"
                          class="bits-license__checkbox"
                          checked={draftRights[mediaType][rightRow.key] === true ||
                            rightRow.key === 'BY'}
                          disabled={rightRow.key === 'BY'}
                          onchange={event =>
                            toggleDraftRight(
                              mediaType,
                              rightRow.key,
                              (event.currentTarget as HTMLInputElement).checked,
                            )}
                        >
                      </div>
                    {/each}
                  {/if}

                  <div
                    class="bits-license__rights-cell bits-license__rights-cell--description bits-license__table-description"
                  >
                    {rightRow.description}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if wizardStep === 3}
          <div class="bits-license__wizard">
            <div
              class="bits-license__prompt-block bits-license__prompt-block--centered"
            >
              <h3 class="bits-license__prompt-title">
                {m.admin__project_license_step3_question()}
              </h3>
              <div
                class="bits-license__binary-choice bits-license__binary-choice--narrow"
              >
                <button
                  type="button"
                  class={[
                    'bits-license__choice-card',
                    'bits-license__choice-card--compact',
                    'bits-license__choice-card--large',
                    'bits-license__choice-card--centered',
                    !draftUseCustomLicenseLabels ? 'bits-license__choice-card--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onclick={enableDraftStandardLicenses}
                >
                  <span class="bits-license__choice-title"
                    >{m.admin__project_license_standard()}</span
                  >
                </button>
                <div
                  class="bits-license__binary-choice-divider"
                  aria-hidden="true"
                ></div>
                <button
                  type="button"
                  class={[
                    'bits-license__choice-card',
                    'bits-license__choice-card--compact',
                    'bits-license__choice-card--large',
                    'bits-license__choice-card--centered',
                    draftUseCustomLicenseLabels ? 'bits-license__choice-card--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onclick={enableDraftCustomLicenses}
                >
                  <span class="bits-license__choice-title"
                    >{m.admin__project_license_custom()}</span
                  >
                </button>
              </div>
              <p class="bits-license__license-stage-title">
                {draftUseCustomLicenseLabels
                  ? m.admin__project_license_stage_custom()
                  : m.admin__project_license_stage_standard()}
              </p>
            </div>

            <div class="bits-license__license-stage">
              <div
                class={[
                  'bits-license__custom-grid',
                  'bits-license__custom-grid--stage',
                  draftUseCustomLicenseLabels ? 'bits-license__license-panel--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div class="bits-license__custom-field">
                  <span
                    class="bits-license__field-label bits-license__field-label--centered bits-license__custom-field-label"
                    >{m.admin__project_license_media_text()}</span
                  >
                  <input
                    class="bits-license__text-input bits-license__text-input--custom-license"
                    type="text"
                    maxlength="128"
                    placeholder={standardGeneratedLicense.media.text.license}
                    value={draftCustomLicenseLabels.text}
                    oninput={event =>
                      handleDraftCustomLabelInput(
                        'text',
                        (event.currentTarget as HTMLInputElement).value,
                      )}
                  >
                  <div class="bits-license__custom-field-actions">
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('text', 'publicDomain')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CcPdAltIcon class="bits-license__custom-preset-icon" />
                    </button>
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('text', 'allRightsReserved')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CopyrightLineIcon class="bits-license__custom-preset-icon" />
                    </button>
                  </div>
                </div>

                <div class="bits-license__custom-field">
                  <span
                    class="bits-license__field-label bits-license__field-label--centered bits-license__custom-field-label"
                    >{m.admin__project_license_media_image()}</span
                  >
                  <input
                    class="bits-license__text-input bits-license__text-input--custom-license"
                    type="text"
                    maxlength="128"
                    placeholder={standardGeneratedLicense.media.image.license}
                    value={draftCustomLicenseLabels.image}
                    oninput={event =>
                      handleDraftCustomLabelInput(
                        'image',
                        (event.currentTarget as HTMLInputElement).value,
                      )}
                  >
                  <div class="bits-license__custom-field-actions">
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('image', 'publicDomain')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CcPdAltIcon class="bits-license__custom-preset-icon" />
                    </button>
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('image', 'allRightsReserved')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CopyrightLineIcon class="bits-license__custom-preset-icon" />
                    </button>
                  </div>
                </div>

                <div class="bits-license__custom-field">
                  <span
                    class="bits-license__field-label bits-license__field-label--centered bits-license__custom-field-label"
                    >{m.admin__project_license_media_data()}</span
                  >
                  <input
                    class="bits-license__text-input bits-license__text-input--custom-license"
                    type="text"
                    maxlength="128"
                    placeholder={standardGeneratedLicense.media.data.license}
                    value={draftCustomLicenseLabels.data}
                    oninput={event =>
                      handleDraftCustomLabelInput(
                        'data',
                        (event.currentTarget as HTMLInputElement).value,
                      )}
                  >
                  <div class="bits-license__custom-field-actions">
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('data', 'publicDomain')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CcPdAltIcon class="bits-license__custom-preset-icon" />
                    </button>
                    <button
                      type="button"
                      class="bits-license__custom-preset-button"
                      onclick={() => applyDraftCustomPreset('data', 'allRightsReserved')}
                    >
                      <span class="bits-license__custom-preset-label">
                        {m.admin__project_license_set()}
                      </span>
                      <CopyrightLineIcon class="bits-license__custom-preset-icon" />
                    </button>
                  </div>
                </div>
              </div>

              <div
                class={[
                  'bits-license__preview-grid',
                  'bits-license__preview-grid--stage',
                  !draftUseCustomLicenseLabels ? 'bits-license__license-panel--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {#each standardLicensePreviewRows as row (row.key)}
                  <div class="bits-license__preview-card">
                    <span class="bits-license__preview-label">{row.label}</span>
                    {#if getStandardLicenseUrl(row.license)}
                      <a
                        class="bits-license__preview-license bits-license__preview-license-link"
                        href={getStandardLicenseUrl(row.license) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.license}
                      </a>
                    {:else}
                      <span class="bits-license__preview-license">{row.license}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if wizardStep === 4}
          <div class="bits-license__wizard">
            <div
              class="bits-license__prompt-block bits-license__prompt-block--centered"
            >
              {#if draftIntent === 'conditional'}
                <p class="bits-license__eyebrow">
                  {m.admin__project_license_and_finally()}
                </p>
              {/if}
              <h3 class="bits-license__prompt-title">{attributionPromptTitle}</h3>
            </div>

            <div class="bits-license__field-group bits-license__field-group--centered">
              <input
                id="project-license-attribution"
                class="bits-license__text-input bits-license__text-input--attribution"
                type="text"
                maxlength="128"
                placeholder={attributionPlaceholder}
                value={draftAttribution}
                oninput={event => {
                  draftAttribution = (event.currentTarget as HTMLInputElement).value
                }}
              >
            </div>
          </div>
        {/if}

        <div class="bits-license__footer">
          <div
            class="bits-license__stepper bits-license__stepper--footer"
            aria-label="License wizard steps"
          >
            {#each [1, 2, 3, 4] as step}
              <span
                class={[
                  'bits-license__step-dot',
                  wizardStep === step ? 'bits-license__step-dot--active' : '',
                  wizardStep > step ? 'bits-license__step-dot--complete' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              ></span>
            {/each}
          </div>
          <div class="bits-license__dialog-actions">
            {#if wizardStep > 1}
              <Button
                text={m.admin__project_license_back()}
                size="sm"
                style="outline"
                color="neutral"
                onClick={handleBack}
              />
            {/if}

            {#if wizardStep < 4}
              <Button
                text={m.admin__project_license_next()}
                size="sm"
                style="soft"
                color="primary"
                onClick={handleNext}
              />
            {:else}
              <Button
                text={m.admin__project_license_accept()}
                size="sm"
                style="soft"
                color="primary"
                onClick={applyDraftLicense}
              />
            {/if}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
</section>
