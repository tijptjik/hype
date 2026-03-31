<script lang="ts">
import Portal from 'svelte-portal'
import { fade } from 'svelte/transition'
import { m } from '$lib/i18n'
import ViewerStage from './ViewerStage.svelte'
import type { FullScreenProps } from './imagePrimitives.types'

let {
  currentItem,
  activeId,
  fit = 'fit',
  viewTransitionName,
  onCurrentItemLoad,
  onDismiss,
}: FullScreenProps = $props()
</script>

<Portal target="body">
  <button
    type="button"
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/88 p-4"
    in:fade={{ duration: 180 }}
    out:fade={{ duration: 140 }}
    onclick={() => {
      void onDismiss?.()
    }}
    aria-label={m.gallery__fullscreen_exit_viewer()}
  >
    <div
      class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,rgba(0,0,0,0)_42%)]"
    ></div>
    <div class="relative h-full w-full">
      <ViewerStage
        {currentItem}
        {activeId}
        {fit}
        rounded="rounded-none"
        class="mx-auto max-w-[min(100vw,1800px)]"
        showBackdrop={false}
        {viewTransitionName}
        {onCurrentItemLoad}
      />
    </div>
  </button>
</Portal>
