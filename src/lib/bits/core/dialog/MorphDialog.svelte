<script lang="ts">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// PRIMITIVES
import { Dialog } from 'bits-ui'
// TRANSITIONS
import { REVIEW_DIALOG_TRANSITION, transitionReviewDialog } from './dialogTransition.js'
// ICONS
import XIcon from 'virtual:icons/proicons/cancel'

let {
  open = $bindable(false),
  busy = false,
  wide = false,
  source = null,
  title,
  description,
  children,
  footer,
  showFooter = true,
  closeLabel = 'Close',
}: {
  open?: boolean
  busy?: boolean
  wide?: boolean
  source?: HTMLElement | null
  title: string
  description?: string
  children?: Snippet
  showFooter?: boolean
  footer?: Snippet
  closeLabel?: string
} = $props()
let shown = $state(false)
let origin: HTMLElement | null = null
let sequence = 0

$effect(() => {
  const requested = open
  untrack(() => {
    const token = ++sequence
    if (requested === shown) return
    if (requested)
      origin =
        source ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const button =
      origin?.isConnected && !origin.closest('[role="dialog"]') ? origin : null
    const previousName =
      button?.style.viewTransitionName === REVIEW_DIALOG_TRANSITION
        ? ''
        : (button?.style.viewTransitionName ?? '')
    if (requested && button) button.style.viewTransitionName = REVIEW_DIALOG_TRANSITION
    void transitionReviewDialog(() => {
      if (token !== sequence) return
      if (button)
        button.style.viewTransitionName = requested
          ? previousName
          : REVIEW_DIALOG_TRANSITION
      shown = requested
    }).finally(() => {
      if (button) button.style.viewTransitionName = previousName
    })
  })
})
</script>

<Dialog.Root
  open={shown}
  onOpenChange={next => {
    if (!busy) open = next
  }}
>
  <Dialog.Portal>
    <!-- The scrim stays live while only the dialog participates in size transitions. -->
    <Dialog.Overlay
      data-review-scrim
      class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
    />
    <Dialog.Content
      style={`view-transition-name: ${shown ? REVIEW_DIALOG_TRANSITION : 'none'}`}
      onEscapeKeydown={event => {
        if (busy) event.preventDefault()
      }}
      onInteractOutside={event => {
        if (busy) event.preventDefault()
      }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        origin?.focus({ preventScroll: true })
      }}
      class={`border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[1001] flex max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
    >
      <header class="flex shrink-0 items-start justify-between gap-6 px-6 pt-6 pb-5">
        <div class="min-w-0 space-y-2">
          <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight"
            >{title}</Dialog.Title
          >
          {#if description}
            <Dialog.Description class="text-muted-foreground text-sm leading-relaxed"
              >{description}</Dialog.Description
            >
          {/if}
        </div>
        <Dialog.Close
          class="border-foreground/10 bg-foreground/[0.04] text-foreground/72 hover:bg-foreground/[0.08] hover:text-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition"
          disabled={busy}
          aria-label={closeLabel}
        >
          <XIcon class="size-5" />
        </Dialog.Close>
      </header>
      <div class="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
        {@render children?.()}
      </div>
      {#if footer && showFooter}
        <footer
          class="border-border flex shrink-0 justify-end gap-3 border-t px-6 py-5"
        >
          {@render footer()}
        </footer>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
/* Capture only the named dialog; page and scrim keep rendering continuously. */
:global(:root[data-review-transition]) {
  view-transition-name: none;
}
</style>
