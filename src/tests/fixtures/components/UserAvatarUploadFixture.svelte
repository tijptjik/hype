<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import UserProfileVisual from '#lib/bits/patterns/userDirectory/UserProfileVisual.svelte'
const responsive = setResponsiveCtx()
let width = $state(1280)
let height = $state(800)
$effect(() => responsive.setWindowDimensions(width, height))
let selection = $state<{ imageId: string; url: string } | null>(null)
let epoch = $state(0)
let busy = $state(false)
</script>
<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<main class="bg-base-100 text-base-content min-h-screen">
  <UserProfileVisual
    profile={{ id: 'target' }}
    initialPreviews={[]}
    avatar={selection?.url ?? null}
    editing={true}
    selectionEpoch={epoch}
    onImageChange={value => (selection = value)}
    onBusyChange={value => (busy = value)}
    onMore={() => {}}
  />
  <button
    type="button"
    onclick={() => {
      epoch += 1
      selection = null
    }}
  >
    Reset fixture
  </button>
  <output aria-label="Selection">{selection?.imageId ?? 'none'}</output>
  <output aria-label="Upload busy">{String(busy)}</output>
</main>
