<script lang="ts">
// COMPONENTS
import TriStateToggle from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
// DOMAIN
import {
  LOGO_QUALITIES,
  type LogoQualityFilters,
  type LogoQualityKey,
} from '#lib/locations/catalogueQuality.js'
let {
  value,
  onChange,
}: {
  value: LogoQualityFilters
  onChange: (key: LogoQualityKey, value: boolean | null) => void
} = $props()
</script>
{#each LOGO_QUALITIES as quality (quality.key)}
  <fieldset class="flex min-w-36 shrink-0 justify-center" aria-label={quality.label}>
    <TriStateToggle
      label={quality.label}
      tooltip={quality.description}
      transformOffset={0}
      alwaysShowLabels
      falseLabel="No"
      trueLabel="Yes"
      currentValue={value[quality.key] ?? null}
      onCheckedChange={next => onChange(quality.key, next)}
    />
  </fieldset>
{/each}
