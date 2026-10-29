<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
// BITS COMPONENTS
import { Main } from '#lib/bits/custom/index.js'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ICONS
import FeatureIcon from 'virtual:icons/proicons/location'
import EditIcon from 'virtual:icons/proicons/pencil'

const responsive = setResponsiveCtx()
let width = $state(1280)
let height = $state(900)
$effect(() => responsive.setWindowDimensions(width, height))
const view = setSurfaceCtx(
  new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    responsive,
    undefined,
    'admin',
  ),
)
setAdminCtx(view)
setHeaderCtrl()
view.scope.prisms = {
  organisation: ['unrelated-org'],
  project: ['unrelated-project'],
  layer: ['unrelated-layer'],
}
let showFeatures = $state(false)
onDestroy(() => view.dispose())
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<main class="bits-theme flex h-screen min-h-0 flex-col bg-panel">
  <Header
    title={{ text: 'Independent Bookstores' }}
    avatar={{ isVisible: false }}
    formActions={{
      isVisible: true,
      primaryAction: { text: 'Edit', icon: EditIcon },
      featuresAction: {
        text: 'Features',
        icon: FeatureIcon,
        onClick: () => {
          showFeatures = true
          window.history.replaceState(null, '', '#features')
        },
      },
    }}
  />
  <Main.Root class="min-h-0 flex-1">
    <Main.Facet
      isVisible={showFeatures}
      transition="fade"
      fillHeight
      edgeToEdge
      contentClass="h-full overflow-hidden"
    >
      {#if showFeatures}
        <ScopedFeatureIndex resourceType="project" resourceId="fixture-project" />
      {/if}
    </Main.Facet>
  </Main.Root>
</main>
