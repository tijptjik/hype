<script lang="ts">
// COMPONENTS
import LocaleSourceStrip from '#lib/bits/custom/localeControls/LocaleSourceStrip.svelte'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'

// The caller owns source eligibility, target selection and translation requests.
let {
  compact = false,
  visible,
  sources,
  label,
  busy = false,
  busySource,
  disabled = false,
  onTranslate,
}: {
  compact?: boolean
  visible: boolean
  sources: readonly { locale: string; label: string; accessibleLabel: string }[]
  label: string
  busy?: boolean
  busySource?: string
  disabled?: boolean
  onTranslate: (locale: string) => void
} = $props()
</script>

<div
  data-i18n-source-bar
  class="grid max-w-full min-w-0 transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
  style:grid-template-rows={visible ? '1fr' : '0fr'}
  style:opacity={visible ? 1 : 0}
  aria-hidden={!visible}
  inert={!visible}
>
  <div class="min-h-0 overflow-hidden">
    <div
      class="flex min-w-0 items-center text-xs text-muted-foreground {compact
        ? 'gap-0.5'
        : 'mt-2 gap-1'}"
      aria-busy={busy}
      data-profile-sources={visible ? '' : undefined}
    >
      <LanguagesIcon class="size-3.5 shrink-0" /><span class="shrink-0">{label}</span>
      <LocaleSourceStrip>
        {#each sources as source (source.locale)}
          <button
            type="button"
            aria-busy={busy && busySource === source.locale}
            class="rounded py-1 {compact ? 'px-1' : 'px-2'} {busy &&
            busySource === source.locale
              ? 'animate-pulse bg-primary/10 text-primary motion-reduce:animate-none'
              : ''} enabled:hover:bg-primary/10 enabled:hover:text-primary disabled:opacity-50 aria-busy:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={source.accessibleLabel}
            disabled={busy || disabled}
            onclick={() => onTranslate(source.locale)}
          >
            {source.label}
          </button>
        {/each}
      </LocaleSourceStrip>
    </div>
  </div>
</div>
