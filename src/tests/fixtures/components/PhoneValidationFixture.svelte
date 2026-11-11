<script lang="ts">
import FeatureFieldPhone from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldPhone.svelte'
let value = $state('["+85223753668","invalid"]')
</script>
<div class="bits-theme bg-panel text-foreground p-8">
  <FeatureFieldPhone id="shared" {value} onChange={next => (value = next)} />
  <button type="button">Next field</button>
</div>
