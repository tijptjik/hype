<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { CheckCircle } from '@steeze-ui/heroicons';

let { onclick } = $props();
</script>

<button
  class="btn btn-ghost btn-sm hover:bg-transparent hover:text-green-300"
  {onclick}>
  <Icon src={CheckCircle} class="h-4 w-4" />
  {m.shy_sunny_hare_revive()}
</button>
