<script lang="ts">
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte'
import GalleryActions from '$lib/components/forms/actions/Gallery.svelte'
import GalleryStats from '$lib/components/forms/stats/Gallery.svelte'
import Gallery from '$lib/components/images/gallery/Gallery.svelte'
// TYPES
import type { SectionProps } from '$lib/types'

// TYPES
type Props = SectionProps

// SERVICES
const imageCtx = getImageCtx()

// STATE : PROPS
let { ...sectionProps }: Props = $props()
let inputElement = $state<HTMLInputElement>()

// ACTIONS
let actionProps: {
  searchMode: boolean
  removeMode: boolean
} = $state({
  searchMode: false,
  removeMode: false,
})

const actions: Record<'add' | 'remove', (...args: any[]) => void> = {
  add: (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    actionProps.removeMode = false
    openFileDialog()
  },
  remove: (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    if (imageCtx.getImages().length > 0) {
      actionProps.removeMode = !actionProps.removeMode
      imageCtx.resetPendingConfirmation()
    }
  },
}

// Fn for opening the file dialog programmatically
const openFileDialog = () => {
  if (inputElement) {
    inputElement.value = ''
    inputElement.click()
  }
}
</script>

<div
  class="z-10 flex w-64 shrink-0 flex-col rounded-2xl p-0 caret-transparent @container"
>
  <Header {...sectionProps}>
    <GalleryStats />
    {#snippet actionContent()}
      <GalleryActions {actions} bind:removeMode={actionProps.removeMode} />
    {/snippet}
  </Header>
  <main class="relative h-full overflow-hidden pl-4 pt-2">
    <Gallery orientation="vertical" {actionProps} bind:inputElement />
  </main>
</div>
