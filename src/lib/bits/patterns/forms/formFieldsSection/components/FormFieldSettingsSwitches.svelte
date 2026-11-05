<script lang="ts">
// COMPONENTS
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'

let {
  propertyId,
  showTranslations,
  isTranslatable,
  isPublic,
  isEditing = true,
  onTranslationsChange,
  onAudienceChange,
}: {
  propertyId: string
  showTranslations: boolean
  isTranslatable: boolean
  isPublic: boolean
  isEditing?: boolean
  onTranslationsChange: (checked: boolean) => void
  onAudienceChange: (checked: boolean) => void
} = $props()
</script>

<!-- Intrinsic label columns align both switch tracks as their text widths change. -->
<div
  class="border-border/40 mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-1 border-t pt-3"
>
  {#if showTranslations}
    <div
      class="col-span-full grid min-h-9 grid-cols-subgrid items-center [&_.bits-switch-label:first-child]:text-right [&_.bits-switch-row]:contents [&>.bits-switch-field]:contents"
    >
      <Label for={`translation-${propertyId}`} text="Translatable Options" />
      <Switch
        id={`translation-${propertyId}`}
        checked={isTranslatable}
        disabled={!isEditing}
        leftText="Off"
        rightText="On"
        size="sm"
        onCheckedChange={value => onTranslationsChange(Boolean(value))}
      />
    </div>
  {/if}
  <div
    class="col-span-full grid min-h-9 grid-cols-subgrid items-center [&_.bits-switch-label:first-child]:text-right [&_.bits-switch-row]:contents [&>.bits-switch-field]:contents"
  >
    <Label for={`audience-${propertyId}`} text="Visibility" />
    <Switch
      id={`audience-${propertyId}`}
      checked={isPublic}
      disabled={!isEditing}
      leftText="Internal"
      rightText="Public"
      size="sm"
      onCheckedChange={value => onAudienceChange(Boolean(value))}
    />
  </div>
</div>
