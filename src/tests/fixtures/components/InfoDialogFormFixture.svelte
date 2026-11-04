<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import InfoDialog from '#lib/bits/core/dialog/InfoDialog.svelte'
setResponsiveCtx()
</script>
<form onsubmit={event => event.preventDefault()}>
  <input aria-label="Location name">
  <InfoDialog title="Actions" triggerText="">Field controls</InfoDialog>
</form>
