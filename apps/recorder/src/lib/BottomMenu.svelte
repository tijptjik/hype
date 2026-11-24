<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
let { view }: { view: string } = $props()
let hidden = $state(false)
let previous = 0
let distance = 0
$effect(() => {
  view
  hidden = false
  distance = 0
})
onMount(() => {
  previous = window.scrollY
  function scroll(): void {
    const position = Math.max(
      0,
      Math.min(
        window.scrollY,
        document.documentElement.scrollHeight - window.innerHeight,
      ),
    )
    const delta = position - previous
    previous = position
    if (Math.sign(delta) !== Math.sign(distance)) distance = 0
    distance += delta
    if (position < 16) hidden = false
    else if (Math.abs(distance) > 12) hidden = distance > 0
  }
  window.addEventListener('scroll', scroll, { passive: true })
  return () => window.removeEventListener('scroll', scroll)
})
</script>

<nav
  aria-label="Main menu"
  class={[
    'fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg justify-end border-t border-slate-800 bg-[#08090e]/95 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-200 motion-reduce:transition-none',
    hidden ? 'translate-y-full' : 'translate-y-0',
  ]}
  inert={hidden}
>
  <button
    type="button"
    aria-label="User"
    disabled
    class="grid size-12 place-items-center rounded-xl text-slate-300"
  >
    <svg
      aria-hidden="true"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </svg>
  </button>
</nav>
