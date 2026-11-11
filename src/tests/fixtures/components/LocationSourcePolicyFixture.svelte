<script lang="ts">
import LocationUpdatePolicyForm from '#lib/bits/patterns/forms/locationUpdatePolicy/LocationUpdatePolicyForm.svelte'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
let staged = $state<string | undefined>()
let editing = $state(true)
</script>
<button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
<LocationUpdatePolicyForm
  initial={{ policy: DEFAULT_PROJECT_LOCATION_POLICY, revision: 0 }}
  {staged}
  isEditing={editing}
  onChange={value => (staged = value)}
/>
<output data-draft class="sr-only">{staged ?? ''}</output>
