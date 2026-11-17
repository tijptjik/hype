<script lang="ts">
// BITS COMPONENTS
import { DropdownMenu, Tooltip } from 'bits-ui'
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
import AutomaticIcon from 'virtual:icons/lucide/sparkles'
import AddressIcon from 'virtual:icons/lucide/map-pin-house'
import PlusCodeIcon from 'virtual:icons/lucide/grid-2x2'
import HkgcodeIcon from 'virtual:icons/lucide/grid-3x3'
// ADDRESSES
import { featureHkgcode } from '#lib/addresses/hkgcode.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let {
  value = 'automatic',
  compact = false,
  readOnly = false,
  coordinates,
  onChange,
}: {
  compact?: boolean
  readOnly?: boolean
  coordinates?: readonly number[] | null
  value?: FeatureAddress['locationDisplayMode']
  onChange: (value: NonNullable<FeatureAddress['locationDisplayMode']>) => void
} = $props()
const options = [
  {
    value: 'automatic',
    label: 'Automatic',
    icon: AutomaticIcon,
    description: 'Use an address when available, otherwise a Plus Code',
  },
  {
    value: 'address',
    label: 'Address',
    icon: AddressIcon,
    description: 'Display the associated address',
  },
  {
    value: 'plus_code',
    label: 'Plus Code',
    icon: PlusCodeIcon,
    description: 'Display a Plus Code from the feature marker',
  },
  {
    value: 'hkgcode',
    label: 'HKGeocode',
    icon: HkgcodeIcon,
    description: 'Display a Hong Kong GeoCode from the feature marker (5 × 5 m cell)',
  },
] as const
const hkgcodeAvailable = $derived(Boolean(featureHkgcode(coordinates)))
let trigger = $state<HTMLButtonElement | null>(null)
let open = $state(false)
let helpOpen = $state(false)
$effect(() => {
  if (open && helpOpen) helpOpen = false
})
const current = $derived(options.find(option => option.value === value) ?? options[0])
</script>

<!-- Hover help must not add a competing click-to-open popover around the menu. -->
<Tooltip.Provider delayDuration={1200}>
  <Tooltip.Root bind:open={helpOpen}>
    <Tooltip.Trigger tabindex={-1}>
      {#snippet child({ props })}
        <span {...props} class="inline-flex">
          {#if readOnly}
            <button
              type="button"
              aria-label={`Display location using: ${current.label}`}
              class="text-muted-foreground focus-visible:outline-primary inline-flex shrink-0 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <current.icon class={compact ? 'size-5' : 'size-7'} aria-hidden="true" />
            </button>
          {:else}
            <DropdownMenu.Root bind:open onOpenChange={() => (helpOpen = false)}>
              <DropdownMenu.Trigger
                bind:ref={trigger}
                aria-label={`Display location using: ${current.label}`}
                class="text-muted-foreground hover:text-primary focus-visible:outline-primary inline-flex shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <current.icon
                  class={compact ? 'size-5' : 'size-7'}
                  aria-hidden="true"
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  onCloseAutoFocus={event => {
                    event.preventDefault()
                    trigger?.focus({ preventScroll: true })
                  }}
                  side="bottom"
                  align="start"
                  sideOffset={8}
                  class="bits-theme border-border bg-panel text-foreground z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-xl border p-1.5 shadow-xl outline-none"
                >
                  <DropdownMenu.RadioGroup
                    value={value ?? 'automatic'}
                    onValueChange={next => {
                      const option = options.find(option => option.value === next)
                      if (option && (option.value !== 'hkgcode' || hkgcodeAvailable))
                        onChange(option.value)
                    }}
                    aria-label="Display location using"
                  >
                    {#each options as option (option.value)}
                      <DropdownMenu.RadioItem
                        value={option.value}
                        textValue={option.label}
                        disabled={option.value === 'hkgcode' && !hkgcodeAvailable}
                        class="data-highlighted:bg-primary/10 grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-3 rounded-lg px-3 py-2.5 outline-none data-disabled:cursor-default data-disabled:opacity-40"
                      >
                        <option.icon class="size-5" aria-hidden="true" />
                        <span class="min-w-0">
                          <span class="block text-sm font-medium">{option.label}</span>
                          <span
                            class="text-muted-foreground block text-xs whitespace-normal"
                            >{option.value === 'hkgcode' && !hkgcodeAvailable
                              ? 'Place the feature marker within Hong Kong GeoCode coverage'
                              : option.description}</span
                          >
                        </span>
                        {#if current.value === option.value}
                          <CheckIcon class="text-primary size-4" aria-hidden="true" />
                        {/if}
                      </DropdownMenu.RadioItem>
                    {/each}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}
        </span>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        role="tooltip"
        side="top"
        sideOffset={8}
        collisionPadding={16}
        class="bits-theme bits-tooltip__content max-w-80 space-y-3 p-3 text-sm"
      >
        <p class="font-semibold">Display location using: {current.label}</p>
        {#each options as option (option.value)}
          <div class="flex items-start gap-3">
            <option.icon
              class="text-primary mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p class="font-medium">{option.label}</p>
              <p class="text-muted-foreground text-xs">{option.description}</p>
            </div>
          </div>
        {/each}
        {#if !readOnly}
          <p class="text-muted-foreground text-xs">Click to change the display mode.</p>
        {/if}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
