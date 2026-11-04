<script lang="ts">
// COMPONENTS
import TooltipProvider from '#lib/bits/core/tooltip/TooltipProvider.svelte'
import LocationControlsInfo from '#lib/bits/patterns/forms/featureLocation/LocationControlsInfo.svelte'
import LocationSyncSelect from '#lib/bits/patterns/forms/featureLocation/LocationSyncSelect.svelte'
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
let mode = $state<'linked' | 'unlinked' | 'manual'>('linked')
let visibility = $state<'shared' | 'exclusive'>('shared')
</script>
<TooltipProvider />
<main class="bits-theme bg-canvas text-foreground min-h-screen px-3 pt-24">
  <div class="bg-panel mx-auto max-w-2xl rounded-lg">
    <div
      class="border-border flex flex-wrap items-center justify-end gap-2 border-b p-3"
    >
      <LocationSyncSelect
        value={mode}
        enabledMode="linked"
        onChange={value => (mode = value)}
      />
      <LocationVisibilitySelect
        value={visibility}
        showInfo={false}
        onChange={value => (visibility = value)}
      />
      <LocationControlsInfo />
    </div>
    <div class="space-y-4 p-6">
      <p id="existing-description">Existing accessible description</p>
      <button
        type="button"
        data-tooltip="Keyboard help"
        aria-describedby="existing-description"
        class="border-border rounded border p-2"
      >
        Keyboard target
      </button>
      <div class="border-border h-32 overflow-auto border" data-scroll-region>
        <div class="h-96 p-2">
          <button type="button" data-tooltip="Scrollable help">Scroll target</button>
        </div>
      </div>
      <button type="button">Outside help</button>
    </div>
  </div>
</main>
