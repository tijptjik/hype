<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Row from '#lib/bits/custom/rows/Row.svelte'
setResponsiveCtx()
let clicks = $state(0)
</script>
<div class="bits-theme bg-canvas text-foreground p-4">
  <output aria-label="Opened tasks">{clicks}</output>
  {#each Array.from({ length: 80 }) as _, index}
    <Row
      {index}
      entityId={`task-${index}`}
      title={`Task ${index}`}
      imageSrc={`/__slow-row-image/${index}.png`}
      onclick={() => clicks++}
      onTitleClick={() => clicks++}
      onImageClick={() => clicks++}
      onkeydown={event => {
        if (event.key === 'Enter') clicks++
      }}
    />
  {/each}
</div>
