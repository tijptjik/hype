<script lang="ts">
// BITS-UI
import { Popover } from 'bits-ui'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import LocaleSourceStrip from '#lib/bits/custom/localeControls/LocaleSourceStrip.svelte'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'

// The caller owns source eligibility, target selection and translation requests.
let {
  compact = false,
  visible,
  reserveSpace = false,
  sources,
  label,
  busy = false,
  busySource,
  disabled = false,
  hasTargets = true,
  onTranslate,
}: {
  compact?: boolean
  visible: boolean
  /** Keep translations aligned when edit-only actions become hidden. */
  reserveSpace?: boolean
  sources: readonly { locale: string; label: string; accessibleLabel: string }[]
  label: string
  busy?: boolean
  busySource?: string
  disabled?: boolean
  hasTargets?: boolean
  onTranslate: (locale: string) => void
} = $props()

const uid = $props.id()
const hintId = `${uid}-filled-targets`
let hintOpen = $state(false)
let hintAnchor = $state<HTMLButtonElement | null>(null)
let hintSource = $state('')

/** Explain why a translation has no targets, or run the caller's eligible request.
 * @param event Source-button activation, including keyboard activation.
 * @param locale Selected source language.
 * @returns Nothing; filled targets are never submitted for translation.
 */
function selectSource(event: MouseEvent, locale: string): void {
  if (busy || disabled) return
  if (!hasTargets) {
    hintAnchor = event.currentTarget as HTMLButtonElement
    hintSource = locale
    hintOpen = true
    return
  }
  hintOpen = false
  onTranslate(locale)
}

// Clearing a target or leaving this editing state makes the explanation obsolete.
$effect(() => {
  if (!visible || hasTargets || disabled || busy) hintOpen = false
})

// Keep the hint attached to the selected source without following it out of view.
$effect(() => {
  if (!hintOpen) return
  const dismiss = (): void => {
    hintOpen = false
  }
  document.addEventListener('scroll', dismiss, true)
  window.addEventListener('resize', dismiss)
  return () => {
    document.removeEventListener('scroll', dismiss, true)
    window.removeEventListener('resize', dismiss)
  }
})
</script>

<div
  data-i18n-source-bar
  class="grid max-w-full min-w-0 transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
  style:grid-template-rows={visible || reserveSpace ? '1fr' : '0fr'}
  style:opacity={visible ? 1 : 0}
  aria-hidden={!visible}
  inert={!visible}
>
  <div class="min-h-0 overflow-hidden">
    <div
      class="flex min-w-0 items-center gap-3 text-xs text-muted-foreground {compact
        ? ''
        : 'mt-2'}"
      aria-busy={busy}
      data-profile-sources={visible ? '' : undefined}
    >
      <span class="inline-flex shrink-0 items-center gap-1.5">
        <LanguagesIcon class="size-3.5 shrink-0" />
        <span>{label}</span>
      </span>
      <LocaleSourceStrip>
        {#each sources as source (source.locale)}
          <button
            type="button"
            aria-busy={busy && busySource === source.locale}
            class="rounded px-2 py-1 font-medium text-primary {busy &&
            busySource === source.locale
              ? 'animate-pulse bg-primary/10 text-primary motion-reduce:animate-none'
              : ''} enabled:hover:bg-primary/10 enabled:hover:text-primary disabled:opacity-50 aria-busy:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={source.accessibleLabel}
            aria-describedby={hintOpen && hintSource === source.locale
              ? hintId
              : undefined}
            disabled={busy || disabled}
            onclick={event => selectSource(event, source.locale)}
          >
            {source.label}
          </button>
        {/each}
      </LocaleSourceStrip>
    </div>
  </div>
</div>

<Popover.Root bind:open={hintOpen}>
  <Popover.Portal>
    <Popover.Content
      id={hintId}
      role="tooltip"
      aria-live="polite"
      class="bits-theme bits-tooltip__content z-[250]!"
      customAnchor={hintAnchor}
      side="top"
      sideOffset={8}
      collisionPadding={16}
      strategy="fixed"
      hideWhenDetached={true}
      trapFocus={false}
      preventScroll={false}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      >{m.profile_translation_all_filled()}</Popover.Content
    >
  </Popover.Portal>
</Popover.Root>
