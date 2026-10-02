<script lang="ts">
// ICONS
import Sun from 'virtual:icons/proicons/brightness'
import Moon from 'virtual:icons/proicons/moon'
import Check from 'virtual:icons/proicons/checkmark'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { ThemeOptionProps } from './themePickerPrimitives.types'
let { theme, selected, name, onSelect }: ThemeOptionProps = $props()
</script>

<label
  data-theme={theme.id}
  class="relative flex cursor-pointer flex-col gap-4 rounded-2xl border-2 bg-panel p-4 text-base-content transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-focus {selected
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
    aria-label={`${theme.name} — ${theme.mode === 'dark' ? m.theme_dark() : m.theme_light()}`}
  >
  <span class="flex items-center justify-between gap-2">
    <span class="font-semibold">{theme.name}</span>
    {#if theme.mode === 'dark'}
      <Moon class="size-4 text-muted-foreground" aria-hidden="true" />
    {:else}
      <Sun class="size-4 text-muted-foreground" aria-hidden="true" />
    {/if}
  </span>
  <span class="flex items-center gap-2 rounded-xl bg-canvas p-3" aria-hidden="true">
    <span class="size-5 rounded-full bg-primary"></span>
    <span class="size-5 rounded-full bg-secondary"></span>
    <span class="size-5 rounded-full bg-tertiary"></span>
    {#if selected}
      <Check class="ml-auto size-4 text-primary" />
    {/if}
  </span>
  <span class="text-xs text-muted-foreground"
    >{theme.family}
    · {theme.mode === 'dark' ? m.theme_dark() : m.theme_light()}</span
  >
</label>
