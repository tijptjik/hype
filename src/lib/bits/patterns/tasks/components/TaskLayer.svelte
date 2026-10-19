<script lang="ts">
import { Select } from '#lib/bits/core/index.js'
import { cx } from '#lib/bits/utils.js'
import { m, getI18n } from '#lib/i18n.js'
import type { TaskLayerProps } from '../task.types'

let {
  title = m.resource__layer_singular(),
  currentLayerId,
  options,
  disabled = false,
  isBusy = false,
  class: className = '',
  onLayerChange,
}: TaskLayerProps = $props()

const items = $derived(
  options.map(option => ({
    value: option.id,
    label: getI18n(option, 'name') || option.code || option.id,
  })),
)
</script>

<section
  class={cx(
    'rounded-2xl border border-foreground/10 bg-foreground/[0.03] py-4',
    className,
  )}
>
  <div class="pb-1.5">
    {#if title}
      <div class="text-xs font-semibold text-muted-foreground">
        {title}
      </div>
    {/if}
  </div>

  <Select
    value={currentLayerId ?? undefined}
    {items}
    placeholder={m.resource__layer_singular()}
    disabled={disabled || isBusy}
    triggerClass="w-full border-border bg-surface text-foreground"
    contentClass="border-foreground/12 bg-panel text-foreground text-md"
    onValueChange={value => {
      if (!value || value === currentLayerId) return
      void onLayerChange?.(value)
    }}
  />
</section>
