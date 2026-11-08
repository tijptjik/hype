<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ICONS
import Icon from 'virtual:icons/proicons/location'

setResponsiveCtx()
let index = $state(false)
</script>

{#if !index}
  <!-- Keep the outgoing header mounted while its nullable actions are cleared. -->
  <div out:fade={{ duration: 180 }}>
    <Header
      title={{ text: 'Organization images' }}
      avatar={{ isVisible: false }}
      formActions={{
        isVisible: !index,
        featuresAction: index ? null : { text: 'Features', icon: Icon },
        usersAction: index ? null : { text: 'Users', icon: Icon },
        primaryAction: index ? null : { text: 'Edit', icon: Icon, disabled: true },
        publishAction: index ? null : { kind: 'button', text: 'Publish', disabled: true },
        previewAction: index ? null : { text: 'Preview', icon: Icon },
      }}
    />
  </div>
{:else}
  <h1>Organizations</h1>
{/if}
<button type="button" onclick={() => (index = !index)}>
  {index ? 'Open images' : 'Open index'}
</button>
