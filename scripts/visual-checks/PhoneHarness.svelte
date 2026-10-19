<script lang="ts">
import Phone from '../../src/lib/bits/patterns/forms/formFeatureField/components/FeatureFieldInput.svelte'
let value = $state('invalid')
</script>
<Phone id="test-phone" isPhone {value} isEditing onChange={next => value = next} />
