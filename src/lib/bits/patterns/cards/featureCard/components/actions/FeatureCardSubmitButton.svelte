<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { cx } from '$lib/bits/utils'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'

interface Props {
  onSubmit: () => void
  variant?: 'primary' | 'secondary'
  class?: string
}

let { onSubmit, variant = 'primary', class: className = '' }: Props = $props()

const cardCtx = getCardCtx()
const submissionLabel = $derived(
  cardCtx.getSubmissionLabel() || m.fun_fuzzy_shrike_compose(),
)

function handleSubmitClick(): void {
  onSubmit()
}

const buttonClasses = $derived(
  cx(
    'pointer-events-auto inline-flex min-w-[8.75rem] items-center justify-center gap-2 rounded-full border px-5',
    'h-11 text-[0.8125rem] font-medium uppercase tracking-[0.16em] leading-none',
    'transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    variant === 'secondary'
      ? 'border-white/18 bg-transparent text-white/88 hover:border-white/30 hover:bg-white/6 hover:text-white'
      : 'border-[#2f78ff] bg-[#2f78ff1f] text-[#e0eeff] hover:border-[#5a9dff] hover:bg-[#2f78ff2e] hover:text-white',
    className,
  ),
)
</script>

<button
  type="button"
  class={buttonClasses}
  onclick={handleSubmitClick}
  disabled={cardCtx.isSubmitting}
>
  <span class="inline-flex items-center gap-0.5">
    <span>{cardCtx.isSubmitting ? submissionLabel : m.proof_active_eagle_urge()}</span>
    {#if cardCtx.isSubmitting}
      <span aria-hidden="true" class="inline-flex">
        <span class="animate-pulse">.</span>
        <span class="animate-pulse [animation-delay:160ms]">.</span>
        <span class="animate-pulse [animation-delay:320ms]">.</span>
      </span>
    {/if}
  </span>
</button>
