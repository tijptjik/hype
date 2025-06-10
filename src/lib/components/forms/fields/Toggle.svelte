<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Toggle from '$lib/components/forms/elements/Toggle.svelte';

type Props = {
  label: string;
  checked: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange: (e: Event) => void;
  isSolid?: boolean;
};

let { isSolid = true, ...toggleProps }: Props = $props();
</script>

<div
  class="flex flex-row items-center justify-between gap-4 {isSolid
    ? 'rounded-full bg-base-200'
    : 'bg-base-100'} px-4 py-1 align-baseline">
  <Toggle {...toggleProps} />
</div>
