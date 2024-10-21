<script lang="ts">
import FormResetButton from './FormResetButton.svelte';
import FormSubmitButton from './FormSubmitButton.svelte';

// STATE : PROPS
let { entity }: { entity: string } = $props();
</script>

<li>
  <FormResetButton {entity}/>
</li>
<li>
  <FormSubmitButton {entity}/>
</li>
