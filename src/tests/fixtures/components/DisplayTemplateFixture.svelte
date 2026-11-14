<script lang="ts">
import Editor from '#lib/bits/patterns/forms/displayTemplate/DisplayTemplateEditor.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
let {
  loadExamples,
}: {
  loadExamples?: (input: {
    paths: string[]
    locale: string
  }) => Promise<
    import('#lib/db/services/featureNamingExamples.js').FeatureNamingExample[]
  >
} = $props()
let value = $state('{{ pair(brand.name, branch, " - ") ?? source.name }}')
const properties = ['source.name', 'brand.name', 'branch', 'properties.open'].map(
  path => ({ path, label: path }),
)
</script>
<main class="mx-auto max-w-3xl p-6">
  <Editor
    {value}
    {properties}
    {loadExamples}
    exampleScope={loadExamples ? { type: 'hub', id: 'test-hub' } : undefined}
    onChange={next => (value = next)}
  />
</main>
