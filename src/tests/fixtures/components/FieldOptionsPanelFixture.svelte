<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Facet from '#lib/bits/custom/main/Facet.svelte'
import FieldEditorFixture from './FieldEditorFixture.svelte'

setResponsiveCtx()
</script>

<div class="relative h-dvh overflow-hidden">
  <Facet
    fillHeight
    class="right-0! left-0!"
    previousAction={{ text: 'Previous tab', onClick: () => {} }}
    nextAction={{ text: 'Next tab', onClick: () => {} }}
    attrs={{ 'data-facet-id': 'fields' }}
  >
    <FieldEditorFixture panelPadding />
  </Facet>
</div>
