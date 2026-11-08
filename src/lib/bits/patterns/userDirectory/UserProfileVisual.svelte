<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// COMPONENTS
import UserContributionPreviews from './UserContributionPreviews.svelte'
// BITS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import Button from '#lib/bits/core/button/Button.svelte'
// API
import { getImageSrc, uploadAndProcessImage } from '#lib/client/services/image.js'
import { discardImageUpload } from '#lib/api/image.remote.js'
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
import { ImageContextResource } from '#lib/enums.js'
// ICONS
import PersonIcon from 'virtual:icons/proicons/person'
import UploadIcon from 'virtual:icons/lucide/upload'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionPreview } from '#lib/users/contributionPreview.types.js'

let {
  profile,
  initialPreviews,
  avatar,
  editing,
  selectionEpoch = 0,
  onImageChange,
  onBusyChange,
  onMore,
}: {
  profile: Pick<UserProfile, 'id'>
  initialPreviews?: UserContributionPreview[]
  avatar: string | null
  selectionEpoch?: number
  editing: boolean
  onImageChange: (selection: { imageId: string; url: string }) => void
  onBusyChange: (busy: boolean) => void
  onMore: () => void
} = $props()
let disposed = false
onDestroy(() => {
  disposed = true
})
let uploading = $state(false)
let uploadError = $state('')
let input: HTMLInputElement

/** Upload through the shared asset pipeline; only Save attaches the avatar.
 * @param file Selected avatar file.
 * @returns Completion after staging the image or reporting the error.
 */
async function upload(file: File | undefined): Promise<void> {
  if (!file || !editing || uploading) return
  const targetId = profile.id
  const epoch = selectionEpoch
  uploading = true
  onBusyChange(true)
  uploadError = ''
  try {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
      throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
    if (file.size > 10 * 1024 * 1024)
      throw new Error('Choose an image smaller than 10 MB.')
    const image = await uploadAndProcessImage(file, {
      ctxType: ImageContextResource.user,
      ctxId: targetId,
      isAdminRequest: true,
      attachment: 'deferred',
    })
    const url = getImageSrc(image, { transformation: 'c_fill,h_512,w_512' })
    if (!url) throw new Error('The uploaded image could not be displayed.')
    if (!disposed && profile.id === targetId && editing && selectionEpoch === epoch)
      onImageChange({ imageId: image.image.id, url })
    else await discardImageUpload({ imageId: image.image.id })
  } catch (cause) {
    uploadError = cause instanceof Error ? cause.message : 'Upload failed. Try again.'
  } finally {
    uploading = false
    onBusyChange(false)
    if (input) input.value = ''
  }
}
</script>

<section class="min-w-0" aria-label="User visual overview">
  <VisualSection
    expandedHeight={208}
    minimumHeight={160}
    showImage={false}
    showControls={false}
  >
    {#snippet map()}
      <div class="bg-border/40 flex h-full w-full min-w-0 gap-px">
        <div
          class="bg-foreground/4 relative flex h-full w-44 shrink-0 items-center justify-center overflow-hidden sm:w-52"
        >
          {#if avatar}
            <img
              src={resolveAvatarImageSrc(avatar) ?? ''}
              alt="User avatar"
              class="size-full object-cover"
              referrerpolicy="no-referrer"
            >
          {:else}
            <PersonIcon class="text-muted-foreground/50 size-20" />
          {/if}
          {#if editing}
            <div class="absolute inset-x-0 bottom-3 flex justify-center">
              <Button
                text={uploading ? 'Uploading…' : 'Upload image'}
                iconComponent={UploadIcon}
                size="sm"
                style="outline"
                class="bg-panel!"
                disabled={uploading}
                onClick={() => input.click()}
              />
            </div>
          {/if}
          <input
            bind:this={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Upload user avatar"
            class="sr-only"
            disabled={!editing || uploading}
            onchange={event => void upload(event.currentTarget.files?.[0])}
          >
        </div>
        <UserContributionPreviews {profile} {initialPreviews} {onMore} />
      </div>
    {/snippet}
  </VisualSection>
  {#if uploadError}
    <p role="alert" class="text-error px-6 py-3 text-sm">{uploadError}</p>
  {/if}
</section>
