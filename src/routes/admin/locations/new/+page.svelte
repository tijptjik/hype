<script lang="ts">
let reviewForm: HTMLFormElement

// SVELTE
import { goto } from '$app/navigation'
import { untrack } from 'svelte'
// COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import MapPrimitive from '#lib/bits/patterns/forms/formMapSection/components/MapPrimitive.svelte'
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import { saveLocationReview } from '#lib/locations/saveLocationReview.js'
// DOMAIN
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
// ICONS
import MapPin from 'virtual:icons/proicons/location'

const admin = getAdminCtx()
const header = getHeaderCtrl()
const draft = $derived(
  admin.locationCreation.current?.accountId === admin.view.user?.id
    ? admin.locationCreation.current
    : null,
)
let busy = $state(false)
let failure = $state('')

/** Create the reviewed Location and retain its identity before navigating back.
 * @returns Completion; failures keep the draft available for correction or retry.
 * @remarks The Feature remains unsaved. Its later save links this exact identity.
 */
async function save(): Promise<void> {
  if (!draft || busy) return
  const current = draft
  busy = true
  failure = ''
  try {
    await saveLocationReview(current)
    await goto('/admin/features/new#location')
  } catch (cause) {
    failure = submissionErrorMessage(cause) ?? 'Unable to save Location.'
  } finally {
    busy = false
  }
}

// Forward navigation reopens the handoff so a subsequent Back also applies new edits.
$effect(() => {
  const current = draft
  if (current)
    untrack(() => {
      admin.locationCreation.pending = true
    })
})

// Header actions operate on this draft without submitting its parent Feature.
$effect(() => {
  const available = Boolean(draft)
  const submitting = busy
  untrack(() => {
    header.setHeaderForEntity('New Location', MapPin, new Map())
    header.setCrumbs([{ name: 'New Feature', href: '/admin/features/new#location' }])
    header.setEditing(available)
    header.setFormActions({
      canEdit: available,
      dirty: available,
      isSubmitting: submitting,
      hasIssues: !available,
      canPublish: false,
      showPublishAction: false,
      showDeleteAction: false,
      submit: () => reviewForm?.requestSubmit(),
      reset: () => {
        if (!draft || draft.identity) return
        draft.address = JSON.parse(JSON.stringify(draft.originalAddress))
        draft.names = { ...draft.originalNames }
        failure = ''
      },
    })
  })
})
</script>

<Main.Root
  class="px-0 pt-0"
  onDimensionsChange={(width, height) =>
    admin.view.layout.setMainDimensions(width, height)}
>
  <Main.Facet
    edgeToEdge
    fillHeight
    class="top-0 bottom-0"
    contentClass="h-full overflow-auto"
  >
    <form
      bind:this={reviewForm}
      class="h-full"
      onsubmit={event => {
        event.preventDefault()
        void save()
      }}
    >
      <FormSurface class="flex h-full min-h-0 flex-col">
        <div class="border-border flex items-center gap-4 border-b px-6 py-3">
          <a class="text-primary hover:underline" href="/admin/features/new#location"
            >Back to Feature</a
          >
          <span class="text-muted-foreground text-sm"
            >{draft?.saved
              ? 'Location saved. Save the Feature to link it.'
              : 'Edits are retained with your new Feature. Save here to create the Location first.'}</span
          >
        </div>
        {#if draft?.accessibility && Object.keys(draft.accessibility).length}
          <p class="text-muted-foreground px-6 py-2 text-sm">
            Accessibility changes are saved with the Feature.
          </p>
        {/if}
        {#if failure}
          <p role="alert" class="px-6 py-3">{failure}</p>
        {/if}
        {#if draft}
          <FormFeatureAddress
            address={draft.address}
            coordinates={draft.address.coordinates ?? [114.17, 22.3]}
            isEditing={!busy && !draft.identity}
            showLookup={false}
            isLoading={false}
            onSelectCandidate={() => {}}
            onLookup={() => {}}
            locationKind={draft.kind}
            accessibilityDraft={draft.accessibility}
            onAccessibilityDraftChange={value => {
              if (draft) draft.accessibility = value
            }}
            onChange={address => {
              if (draft) draft.address = address
            }}
            onCoordinateChange={coordinates => {
              if (draft)
                draft.address = {
                  ...draft.address,
                  coordinates: [coordinates[0], coordinates[1]],
                }
            }}
          >
            {#snippet map()}
              {#if draft?.address.coordinates}
                <MapPrimitive
                  coordinates={draft.address.coordinates}
                  addressMeta={{ address: draft.address }}
                  draggable={!busy && !draft.identity}
                  onCoordinateChange={coordinates => {
                    if (draft)
                      draft.address = {
                        ...draft.address,
                        coordinates: [coordinates[0], coordinates[1]],
                      }
                  }}
                />
              {/if}
            {/snippet}
            {#snippet identityFields(translations: boolean)}
              {#if draft && draft.kind !== 'address' && draft.kind !== 'building'}
                <DraftLocationNameFields
                  names={draft.names}
                  kind={draft.kind}
                  {translations}
                  isEditing={!busy && !draft.identity}
                  onChange={names => {
                    if (draft) draft.names = names
                  }}
                />
              {/if}
            {/snippet}
          </FormFeatureAddress>
        {:else}
          <p class="px-6 py-6">
            Select a Location in the new Feature form to review it here.
          </p>
        {/if}
      </FormSurface>
    </form>
  </Main.Facet>
</Main.Root>
