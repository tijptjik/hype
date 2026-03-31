<script lang="ts">
import { Select } from '$lib/bits/core'
import { cx } from '$lib/bits/utils'
import { m, getI18n } from '$lib/i18n'
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
    'rounded-2xl border border-white/10 bg-white/[0.03] py-4',
    className,
  )}
>
  <div class="pb-1.5">
    {#if title}
      <div class="font-mono text-sm uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
    {/if}
  </div>

  <Select
    value={currentLayerId ?? undefined}
    {items}
    placeholder={m.resource__layer_singular()}
    disabled={disabled || isBusy}
    triggerClass="w-full border-white/12 bg-black/40 text-white"
    contentClass="border-white/12 bg-neutral-950 text-white text-md"
    onValueChange={value => {
        if (!value || value === currentLayerId) return
        void onLayerChange?.(value)
      }}
  />
</section>
