<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'

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
  class="bg-base-content/[0.08] relative z-10 mx-auto w-full max-w-md overflow-hidden rounded-[2rem] px-8 py-7 text-center shadow-[0_0_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
>
  <div class="mx-auto max-w-xl">
    <p
      class="text-base-content/45 font-mono text-[11px] font-semibold tracking-[0.24em] uppercase"
    >
      Translation Queue
    </p>
    <h3
      class="text-base-content mt-3 text-5xl leading-none font-black tracking-[-0.06em] sm:text-6xl"
    >
      {rowsNeedingTranslation}
      <span class="text-primary">{featureLabel}</span>
    </h3>
    <p class="text-base-content/60 mt-3 text-lg font-semibold">
      {rowsNeedingTranslation === 0
        ? m.feature_import__translation_require_no_translation()
        : m.feature_import__translation_require_translation()}
    </p>
  </div>
</section>
