<script lang="ts">
import FormI18nSourceBar from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nSourceBar.svelte'
let chosen = $state('none')
const sources = ['En', '繁中', '简中', '日', 'Pt-BR', 'Pt', 'Fr', 'De', 'Es'].map(
  locale => ({ locale, label: locale, accessibleLabel: `Translate from ${locale}` }),
)
</script>
<div class="text-muted-foreground p-6">
  <div data-fixture-header class="flex w-[290px] items-center rounded border p-3">
    <span class="shrink-0 pr-2">Option 1</span>
    <div class="ml-auto min-w-0">
      <FormI18nSourceBar
        compact
        visible
        {sources}
        label="from"
        onTranslate={locale => (chosen = locale)}
      />
    </div>
  </div>
  <output>{chosen}</output>
</div>
