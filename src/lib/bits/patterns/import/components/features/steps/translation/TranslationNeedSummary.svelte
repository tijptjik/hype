<script lang="ts">
// I18N
import { m } from '$lib/i18n'

type Props = {
  rowsNeedingTranslation: number
  isTranslating: boolean
  completedTranslations: number
  totalTranslations: number
}

let {
  rowsNeedingTranslation,
  isTranslating,
  completedTranslations,
  totalTranslations,
}: Props = $props()

const featureLabel = $derived(rowsNeedingTranslation === 1 ? 'Feature' : 'Features')
const progressLabel = $derived(
  totalTranslations > 0
    ? `${completedTranslations} / ${totalTranslations} strings`
    : 'No generated strings',
)
</script>

<section
  class="relative z-10 mx-auto w-full max-w-md overflow-hidden rounded-[2rem] bg-base-content/[0.08] px-8 py-7 text-center shadow-[0_0_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
>
  <div class="mx-auto max-w-xl">
    <p
      class="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-base-content/45"
    >
      Translation Queue
    </p>
    <h3
      class="mt-3 text-5xl font-black leading-none tracking-[-0.06em] text-base-content sm:text-6xl"
    >
      {rowsNeedingTranslation}
      <span class="text-primary">{featureLabel}</span>
    </h3>
    <p class="mt-3 text-lg font-semibold text-base-content/60">
      {rowsNeedingTranslation === 0
        ? m.feature_import__translation_require_no_translation()
        : m.feature_import__translation_require_translation()}
    </p>
  </div>
</section>
