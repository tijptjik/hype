<script lang="ts">
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'

let { disabled = false }: { disabled?: boolean } = $props()
let activations = $state(0)
let submissions = $state(0)
let notice = $state(false)
</script>

<form onsubmit={event => { event.preventDefault(); submissions++ }}>
  <SimpleTooltip {disabled} triggerProps={{ 'aria-label': 'Help', role: 'button' }}>
    {#snippet trigger()}<span>Help</span>{/snippet}
    Useful help
  </SimpleTooltip>
  <SimpleTooltip>
    {#snippet trigger()}
      <button type="button" onclick={() => activations++}>Action</button>
    {/snippet}
    Action help
  </SimpleTooltip>
  <SimpleTooltip bind:open={notice} triggerProps={{ 'aria-label': 'Notice', role: 'button' }} contentProps={{ role: 'status' }}>
    {#snippet trigger()}<span>Notice</span>{/snippet}
    Automatic notice
  </SimpleTooltip>
  <button type="button" onclick={() => notice = true}>Show notice</button>
  <button type="button">Outside</button>
</form>
<output data-testid="activations">{activations}</output>
<output data-testid="submissions">{submissions}</output>
