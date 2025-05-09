<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle } from '@steeze-ui/heroicons';

let { onclick } = $props();
</script>

<button
  class="btn btn-ghost btn-sm hover:bg-transparent hover:text-green-300"
  {onclick}>
  <Icon src={XCircle} class="h-4 w-4" />
  {m.direct_nimble_buzzard_reside()}
</button>
