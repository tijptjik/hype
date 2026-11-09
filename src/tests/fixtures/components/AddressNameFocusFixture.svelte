<script lang="ts">
import AddressNamePicker from '#lib/bits/patterns/forms/formFeatureAddress/AddressNamePicker.svelte'
let value = $state('Wah Koon Building')
let resolutions = $state(0)
</script>
<div class="bits-theme bg-panel text-foreground p-8">
  <button type="button">Before building</button>
  <div class="my-4 w-64 overflow-hidden">
    <AddressNamePicker
      family="buildings"
      locale="en"
      label="Building name"
      {value}
      onSelect={record => (value = record?.names.en ?? '')}
      onBlur={() => resolutions++}
    />
  </div>
  <button type="button">Next field</button>
  <output>{resolutions}</output>
</div>
