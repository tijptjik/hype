<script lang="ts">
import { Icon } from '$lib/bits'
import type { Component } from 'svelte'

let {
  name = null,
  src = null,
  icon,
}: {
  name?: string | null
  src?: string | null
  icon: Component
} = $props()

let status = $state<'loading' | 'loaded' | 'error'>('error')

$effect(() => {
  status = src ? 'loading' : 'error'
})

function handleLoad(): void {
  status = 'loaded'
}

function handleError(): void {
  status = 'error'
}
</script>

<div class="relative h-9 w-9 shrink-0 overflow-hidden rounded-[0.55rem] bg-white/8">
  {#if status !== 'loaded'}
    <div
      class={`absolute inset-0 ${status === 'loading' ? 'animate-pulse bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))]' : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))]'}`}
      aria-hidden="true"
    ></div>
  {/if}

  {#if src}
    <img
      {src}
      alt={name ? `${name} avatar` : ''}
      class={`h-full w-full object-cover transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
      onload={handleLoad}
      onerror={handleError}
    >
  {/if}

  {#if !src}
    <div
      class="flex h-full w-full items-center justify-center rounded-[0.55rem] bg-white/10"
    >
      <Icon src={icon} class="h-3.5 w-3.5 text-white/90" />
    </div>
  {/if}
</div>
