<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Badge from '$lib/bits/custom/badge/Badge.svelte'
// TYPES
import type { FeatureTranslationLocaleBlock } from '$lib/client/services/import/features/translation'

type Props = {
  block: FeatureTranslationLocaleBlock
}

let { block }: Props = $props()

const accentClasses = $derived.by(() => {
  if (block.locale === 'en') {
    return {
      root: 'border-info/25',
      glyph: 'text-info',
    }
  }

  if (block.locale === 'zhHant') {
    return {
      root: 'border-warning/25',
      glyph: 'text-warning',
    }
  }

  return {
    root: 'border-success/25',
    glyph: 'text-success',
  }
})
const glyphClass = $derived(
  block.locale === 'en' ? 'origin-bottom scale-y-[1.22] text-8xl' : 'text-8xl',
)
</script>

<section
  class={`relative flex min-h-48 overflow-hidden rounded-3xl border bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl ${accentClasses.root}`}
>
  <div class="flex h-full w-full flex-col justify-between gap-5">
    <div>
      <div
        class={`font-black p-4 leading-none tracking-[-0.08em] ${glyphClass} ${accentClasses.glyph}`}
      >
        {block.glyph}
      </div>
    </div>

    <div class="space-y-2">
      {#if block.columns.length > 0}
        {#each block.columns as column}
          <div
            class="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.06] px-3 py-2"
          >
            <span class="min-w-0 truncate font-mono text-xs text-base-content/75">
              {column.header}
            </span>
            <Badge
              text={column.field}
              tone={column.field === 'title' ? 'success' : 'neutral'}
              class="py-0.5"
            />
          </div>
        {/each}
      {:else}
        <div
          class="rounded-xl border border-dashed border-base-content/15 bg-white/[0.05] px-3 py-4 text-sm text-base-content/55"
        >
          {m.feature_import__translation_no_columns_assigned()}
        </div>
      {/if}
    </div>
  </div>
</section>
