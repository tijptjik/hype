<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import { ExclamationCircle } from '@steeze-ui/heroicons'
// TRANSITIONS
import { fade } from 'svelte/transition'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// TYPES
import type { ImageUpload } from '$lib/db/zod/schema/image.types'

type Props = {
  fileObject: ImageUpload
}

let { fileObject }: Props = $props()

const imageCtx = getImageCtx()
</script>

<div
  class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}
>
  <Icon src={ExclamationCircle} class="h-8 w-8 text-error" />
  <button
    class="btn btn-error btn-sm mt-2"
    onclick={() => imageCtx.retryUpload(fileObject)}
  >
    {m.retry()}
  </button>
</div>
