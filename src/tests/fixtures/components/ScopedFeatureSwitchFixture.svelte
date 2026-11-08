<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
// BITS COMPONENTS
import { Main } from '#lib/bits/custom/index.js'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ICONS
import Icon from 'virtual:icons/proicons/location'

const responsive = setResponsiveCtx()
setRootCTX(responsive)
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
const header = setHeaderCtrl()
let scopes = $state(['first'])
let profileReady = $state(false)
let showFeatures = $state(true)
let width = $state(1560)
let height = $state(900)
$effect(() => responsive.setWindowDimensions(width, height))
$effect(() => {
  header.setHeaderForEntity(
    profileReady ? 'Loaded organisation' : 'Loading organisation',
    Icon,
    new Map(),
  )
})
onDestroy(() => view.dispose())
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<div class="bits-theme bg-panel flex h-screen min-h-0 flex-col">
  <Header
    title={{ text: header.state.meta.title }}
    avatar={{ isVisible: false }}
    query={header.state.search?.query ?? ''}
    filter={{
      isFilterable: Boolean(header.state.search),
      onFilter: header.state.search?.onFilter,
    }}
    formActions={{
      isVisible: !header.state.search,
      primaryAction: { text: 'Edit', icon: Icon },
    }}
    controlBar={header.state.layout.controlBar}
  />
  <nav class="flex gap-4 p-2">
    <button
      type="button"
      onclick={() => {
        scopes = [...scopes, 'second']
        profileReady = false
      }}
    >
      Mount next organisation
    </button>
    <button
      type="button"
      onclick={() => {
        scopes = ['second']
      }}
    >
      Dispose previous organisation
    </button>
    <button
      type="button"
      onclick={() => {
        profileReady = true
      }}
    >
      Resolve profile
    </button>
    <button
      type="button"
      onclick={() => {
        showFeatures = !showFeatures
      }}
    >
      Toggle Features
    </button>
  </nav>
  <Main.Root class="min-h-0 flex-1">
    <Main.Form isReady={profileReady}>
      {#snippet fallback()}
        {#if !showFeatures}
          <p>Profile loading</p>
        {/if}
      {/snippet}
      {#if !showFeatures}
        <p>Profile ready</p>
      {/if}
    </Main.Form>
    <Main.Facet
      isVisible={showFeatures}
      fillHeight
      edgeToEdge
      contentClass="h-full overflow-hidden"
    >
      {#if showFeatures}
        {#each scopes as id (id)}
          <div class={id === scopes.at(-1) ? 'flex h-full flex-col' : 'hidden'}>
            <ScopedFeatureIndex embedded resourceType="organisation" resourceId={id} />
          </div>
        {/each}
      {/if}
    </Main.Facet>
  </Main.Root>
</div>
