<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import ResourceViewer from '#lib/bits/patterns/images/ResourceViewer.svelte'
// PROVIDER
import ImageProvider from '#lib/providers/ImageProvider.svelte'
// ICONS
import ImageIcon from 'virtual:icons/proicons/photo'
// TYPES
import type { ComponentProps } from 'svelte'
import type { ImagePresentation } from '#lib/images/presentation.js'

let {
  isFormReady,
  hasProfileLoadFailed,
  isValid,
  model,
  canEditImagePresentationMode,
  canEditImageDropzone,
  retryOrganisationLoad,
  onPresentationModeCommitted,
}: {
  isFormReady: boolean
  hasProfileLoadFailed: boolean
  isValid: boolean
  model: ComponentProps<typeof ImageProvider>['model']
  canEditImagePresentationMode: boolean
  canEditImageDropzone: boolean
  retryOrganisationLoad: () => void
  onPresentationModeCommitted: (value: ImagePresentation) => void
} = $props()
</script>

<FormSurface class="mb-0! flex h-full min-h-0 flex-col">
  <SectionHeader
    icon={ImageIcon}
    title={m.admin__forms_organisation_image_title()}
    class="shrink-0"
  />
  <div class="min-h-0 flex-1">
    {#if !isFormReady && !hasProfileLoadFailed}
      <section aria-label={m.resource_loading()} aria-busy="true" class="h-full p-6">
        <Skeleton class="h-full min-h-64 w-full rounded-xl" />
      </section>
    {:else if hasProfileLoadFailed}
      <div role="alert" class="text-muted-foreground p-6 text-sm">
        <p>{m.admin__forms_profile_load_failed()}</p>
        <button
          type="button"
          class="border-border hover:bg-raised mt-4 rounded-lg border px-4 py-2"
          onclick={retryOrganisationLoad}
        >
          {m.retry()}
        </button>
      </div>
    {:else if isValid}
      <ImageProvider {model}>
        <ResourceViewer
          workspace
          canEditPresentationMode={canEditImagePresentationMode}
          canEditDropzone={canEditImageDropzone}
          {onPresentationModeCommitted}
        />
      </ImageProvider>
    {:else}
      <div
        class="text-base-content/65 flex h-full w-full items-center justify-center p-6 text-center text-sm"
      >
        {m.admin__forms_organisation_image_save_hint()}
      </div>
    {/if}
  </div>
</FormSurface>
