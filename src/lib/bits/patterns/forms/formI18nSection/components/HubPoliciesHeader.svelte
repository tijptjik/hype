<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { fitSectionHeader } from '#lib/bits/custom/form/fitSectionHeader.js'
import { responsiveSectionHeaderClasses } from '#lib/bits/custom/form/responsiveSectionHeader.styles.js'
// ICONS
import PoliciesIcon from 'virtual:icons/proicons/shield-checkmark'
import RefreshCw from 'virtual:icons/proicons/arrow-sync'
let {
  toolbar,
  disabled = true,
  onRegenerate = () => {},
}: { toolbar: Snippet; disabled?: boolean; onRegenerate?: () => void } = $props()
</script>
<div class={responsiveSectionHeaderClasses} use:fitSectionHeader>
  <SectionHeader
    title="Policies"
    icon={PoliciesIcon}
    description="Configure the privacy policy and terms of service shown for this hub."
    showControlLabels
  >
    {#snippet right()}
      {@render toolbar()}
    {/snippet}
    {#snippet afterControls()}
      <button
        type="button"
        aria-label="Regenerate policies"
        title="Regenerate policies"
        {disabled}
        onclick={onRegenerate}
        class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
      >
        <RefreshCw class="size-4" /><span data-control-label>Regenerate</span>
      </button>
    {/snippet}
  </SectionHeader>
</div>
