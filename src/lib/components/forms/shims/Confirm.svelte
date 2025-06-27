<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationTriangle } from '@steeze-ui/heroicons';

// STATE : PROPS
let { onCancel, onAccept } = $props();
</script>

<div
  class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-glass-result">
  <Icon
    src={ExclamationTriangle}
    class="shrink-10 h-12 w-12 stroke-current opacity-100" />
  <p class="w-1/3 text-center text-xl font-bold text-glass-rejected">
    {m.red_formal_jackal_mix()}
  </p>
  <p class="w-1/3 text-center text-xl text-neutral-content">
    {m.warm_calm_badger_bask()}
  </p>
  <p class="w-1/3 text-center text-xl text-neutral-content">
    {m.hour_solid_goat_aim()}
  </p>
  <div class="flex gap-4">
    <button
      class="btn btn-outline hover:bg-transparent hover:text-base-content/80"
      onclick={onCancel}>{m.green_short_pelican_fall()}</button>
    <button class="btn bg-glass-rejected hover:bg-glass-rejected/80" onclick={onAccept}
      >{m.best_swift_opossum_inspire()}</button>
  </div>
</div>
