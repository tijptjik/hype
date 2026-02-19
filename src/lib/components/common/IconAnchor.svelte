<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte'
import type { Component } from 'svelte'
import type { IconSource } from '@steeze-ui/heroicons'

type Props = {
  position?: 'left' | 'right'
  icon: IconSource
  class?: string
  children?: any
}

let { position = 'right', icon, class: className = '', children }: Props = $props()
</script>

<div class="group/anchor relative z-30 {className}">
  <!-- Icon Button -->
  <div
    class="absolute bottom-0 {position}-0 flex items-center justify-center opacity-70 transition-opacity duration-200 group-hover/anchor:opacity-90"
  >
    <button class="btn btn-circle border-none bg-glass-result">
      <Icon src={icon} class="h-6 w-6 stroke-[2px]" />
    </button>
  </div>

  <!-- Revealed Content -->
  <div class="opacity-0 transition-opacity duration-200 group-hover/anchor:opacity-100">
    {@render children?.()}
  </div>
</div>
