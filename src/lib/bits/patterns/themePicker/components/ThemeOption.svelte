<script lang="ts">
// ICONS
import Sun from 'virtual:icons/proicons/brightness'
import Moon from 'virtual:icons/proicons/moon'
import Check from 'virtual:icons/proicons/checkmark'
// I18N
import { m } from '#lib/i18n.js'
import { getThemeName } from '#lib/themes/i18n.js'
// TYPES
import type { ThemeOptionProps } from './themePickerPrimitives.types'
let { theme, selected, name, onSelect, compact = false }: ThemeOptionProps = $props()
</script>

<label
  data-theme={theme.id}
  class="relative flex cursor-pointer flex-col {compact
    ? 'gap-2 rounded-xl p-3 text-sm'
    : 'gap-4 rounded-2xl p-4'} border-2 bg-panel text-base-content transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-focus {selected
    ? 'border-primary'
    : 'border-border hover:border-primary/60'}"
>
  <input
    class="sr-only"
    type="radio"
    {name}
    value={theme.id}
    checked={selected}
    onchange={onSelect}
    aria-label={`${getThemeName(theme.id)} — ${theme.mode === 'dark' ? m.theme_dark() : m.theme_light()}`}
  >
  <span class="flex items-center justify-between gap-2">
    <span class="font-semibold">{getThemeName(theme.id)}</span>
    {#if theme.mode === 'dark'}
      <Moon class="text-muted-foreground size-4" aria-hidden="true" />
    {:else}
      <Sun class="text-muted-foreground size-4" aria-hidden="true" />
    {/if}
  </span>
  <span
    class="flex items-center gap-2 rounded-xl bg-canvas {compact ? 'p-2' : 'p-3'}"
    aria-hidden="true"
  >
    <span class="{compact ? 'size-3.5' : 'size-5'} rounded-full bg-primary"></span>
    <span class="{compact ? 'size-3.5' : 'size-5'} rounded-full bg-secondary"></span>
    <span class="{compact ? 'size-3.5' : 'size-5'} rounded-full bg-tertiary"></span>
    {#if selected}
      <Check class="text-primary ml-auto size-4" />
    {/if}
  </span>
  {#if !compact}
    <span class="text-muted-foreground text-xs"
      >{theme.family}
      · {theme.mode === 'dark' ? m.theme_dark() : m.theme_light()}</span
    >
  {/if}
</label>
