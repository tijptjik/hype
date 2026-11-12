<script lang="ts">
import type { ComponentProps } from 'svelte'
import Fields from '#lib/bits/patterns/forms/formFeatureFields/FormFeatureFields.svelte'
let { fields }: { fields: ComponentProps<typeof Fields> } = $props()
</script>
<form onsubmit={event => event.preventDefault()}>
  <button type="submit" data-header-save>Save record</button>
  <Fields {...fields} />
</form>
