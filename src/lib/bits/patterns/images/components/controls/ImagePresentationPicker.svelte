<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// TRANSITIONS
import { transitionReviewDialog } from '#lib/bits/core/dialog/dialogTransition.js'
// BITS-UI
import { DropdownMenu } from 'bits-ui'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { cx } from '#lib/bits/utils.js'
import { VIEWER_CONTROLS_BUTTON_CLASSES } from './ViewerControls.styles'
// ICONS
import CoverIcon from 'virtual:icons/proicons/full-screen-maximize'
import BlurIcon from 'virtual:icons/proicons/photo-filter'
import EdgesIcon from 'virtual:icons/proicons/arrow-maximize'
import CheckIcon from 'virtual:icons/proicons/checkmark'
// TYPES
import type { ImagePresentation } from '#lib/images/presentation.js'

let {
  value = 'contain',
  disabled = false,
  busy = false,
  onValueChange,
}: {
  value?: ImagePresentation
  disabled?: boolean
  busy?: boolean
  onValueChange?: (mode: ImagePresentation) => void | Promise<void>
} = $props()

let open = $state(false)
const menuId = $props.id()
const transitionName = `image-menu-${menuId.replace(/[^a-zA-Z0-9-]/g, '')}`
let transitioning = $state(false)

/** Animate only the options menu, leaving its trigger live during selection.
 * @param next Requested menu visibility.
 * @returns Completion after the native transition or reduced-motion update.
 */
async function setOpen(next: boolean): Promise<void> {
  if (next === open) return
  transitioning = true
  await tick()
  try {
    await transitionReviewDialog(() => { open = next })
  } finally {
    transitioning = false
  }
}

const options = $derived([
  {
    value: 'cover',
    label: m.gallery__presentation_cover(),
    description: m.gallery__presentation_cover_description(),
    icon: CoverIcon,
  },
  {
    value: 'contain',
    label: m.gallery__presentation_blur(),
    description: m.gallery__presentation_blur_description(),
    icon: BlurIcon,
  },
  {
    value: 'cast-edges',
    label: m.gallery__presentation_edges(),
    description: m.gallery__presentation_edges_description(),
    icon: EdgesIcon,
  },
] as const)
const current = $derived(options.find(option => option.value === value) ?? options[1])
const CurrentIcon = $derived(current.icon)

/**
 * Sends only a different, available presentation choice to the owning editor.
 * @param next - Value selected by the keyboard-accessible radio menu.
 * @returns Nothing; the editor owns saving and error recovery.
 */
function select(next: string): void {
  const option = options.find(candidate => candidate.value === next)
  if (disabled || busy || !option || option.value === value) return
  void onValueChange?.(option.value)
}
</script>

<DropdownMenu.Root {open} onOpenChange={next => void setOpen(next)}>
  <DropdownMenu.Trigger
    {disabled}
    aria-busy={busy}
    aria-label={`${m.gallery__image_presentation()}: ${current.label}`}
    data-tooltip={`${m.gallery__image_presentation()}: ${current.label}`}
    class={cx(
      VIEWER_CONTROLS_BUTTON_CLASSES,
      'inline-flex size-9 items-center justify-center rounded-full text-base-content outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45',
    )}
  >
    <CurrentIcon class="size-[22px]" aria-hidden="true" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
        style={transitioning && open ? `view-transition-name:${transitionName};view-transition-class:image-menu` : undefined}
      side="top"
      align="center"
      sideOffset={12}
      class="bits-theme border-border-input text-base-content z-[200] w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-(--theme-panel) p-1.5 shadow-xl outline-none"
    >
      <DropdownMenu.RadioGroup
        {value}
        onValueChange={select}
        aria-label={m.gallery__image_presentation()}
      >
        {#each options as option (option.value)}
          <DropdownMenu.RadioItem
            value={option.value}
            disabled={disabled || busy}
            textValue={option.label}
            class="data-highlighted:bg-base-200 grid cursor-pointer grid-cols-[22px_minmax(0,1fr)_16px] items-center gap-3 rounded-lg px-3 py-2.5 outline-none data-disabled:cursor-not-allowed data-disabled:opacity-45"
          >
            <option.icon class="size-[22px]" aria-hidden="true" />
            <span class="min-w-0">
              <span class="block text-sm font-medium">{option.label}</span>
              <span class="text-muted-foreground block text-xs whitespace-normal">
                {option.description}
              </span>
            </span>
            {#if option.value === value}
              <CheckIcon class="text-primary size-4" aria-hidden="true" />
            {/if}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
