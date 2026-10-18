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
  onSelect,
  class: className = '',
  label = m.theme_title(),
}: ThemePickerProps = $props()
const name = $props.id()
</script>

<fieldset class={className}>
  <legend
    class="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
  >
    {label}
  </legend>
  <div class="grid grid-cols-2 gap-3">
    {#each THEMES as theme}
      <ThemePickerPrimitive.Option
        {theme}
        {name}
        selected={value === theme.id}
        onSelect={() => onSelect(theme.id)}
      />
    {/each}
  </div>
</fieldset>
