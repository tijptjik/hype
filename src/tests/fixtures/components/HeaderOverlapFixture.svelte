<script lang="ts">
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Icon from 'virtual:icons/lucide/settings'
setResponsiveCtx()
let panel = $state(false)
let wideIdentity = $state(false)
const items = ['Profile', 'Capabilities', 'Fields', 'Image', 'Advanced'].map(label => ({
  ref: label.toLowerCase(),
  label,
  icon: Icon,
}))
</script>
<div class="bits-theme bg-panel text-foreground">
  <div style:width={panel ? 'calc(100% - 350px)' : '100%'}>
    <Header
      contentStart={wideIdentity ? 900 : 360}
      title={{ text: 'HKFoodWorks' }}
      facets={{ items, active: 'advanced' }}
      avatar={{ isVisible: false }}
      formActions={{
        isVisible: true,
        primaryAction: { text: 'Edit', icon: Icon },
        publishAction: { kind: 'button', text: 'Publish', icon: Icon },
        previewAction: { text: 'Preview', icon: Icon },
      }}
    />
  </div>
  <button type="button" onclick={() => (panel = !panel)}>Toggle settings panel</button>
  <button type="button" onclick={() => (wideIdentity = !wideIdentity)}>
    Toggle identity width
  </button>
</div>
