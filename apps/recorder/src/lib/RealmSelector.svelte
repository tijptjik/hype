<script lang="ts">
// I18N
import { t } from './i18n'
// TYPES
import type { SpatialRealm } from '../../../../src/lib/fieldResearch/recorder'
let {
  value,
  onchange,
  disabled = false,
}: {
  value: SpatialRealm | null
  onchange: (realm: SpatialRealm) => void
  disabled?: boolean
} = $props()
</script>

<fieldset class="grid gap-2" {disabled}>
  <legend class="text-muted mb-2 text-sm font-medium">{t('spatial_realm')}</legend>
  <div class="border-line bg-panel grid grid-cols-2 rounded-xl border p-1">
    {#each ['interior', 'exterior'] as const as realm (realm)}
      <button
        type="button"
        aria-pressed={value === realm}
        class={[
          'min-h-12 rounded-lg font-semibold capitalize',
          value === realm ? 'bg-accent text-on-accent' : 'text-muted',
        ]}
        onclick={() => onchange(realm as SpatialRealm)}
      >
        {t(realm)}
      </button>
    {/each}
  </div>
</fieldset>
