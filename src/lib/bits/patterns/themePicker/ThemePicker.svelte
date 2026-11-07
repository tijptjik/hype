<script lang="ts">
// PATTERN PRIMITIVES
import * as ThemePickerPrimitive from './components'
// THEME
import { THEMES } from '#lib/themes/themes.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { ThemePickerProps } from './themePicker.types'
let {
  value,
  compact = false,
  onSelect,
  class: className = '',
  label = m.theme_title(),
}: ThemePickerProps = $props()
const name = $props.id()
</script>

<fieldset class={className}>
  <legend
    class="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.18em] uppercase"
  >
    {label}
  </legend>
  <div
    class={compact
      ? 'grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2'
      : 'grid grid-cols-2 gap-3'}
  >
    {#each THEMES as theme}
      <ThemePickerPrimitive.Option
        {theme}
        {compact}
        {name}
        selected={value === theme.id}
        onSelect={() => onSelect(theme.id)}
      />
    {/each}
  </div>
</fieldset>
