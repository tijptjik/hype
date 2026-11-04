<script lang="ts">
// SVELTE
import { setContext } from 'svelte'
// COMPONENTS
import Portal from '#lib/bits/patterns/cards/featureCard/components/content/FeatureCardContentPortal.svelte'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

// Supply only the preferences consumed by this isolated presentation fixture.
setContext(Symbol.for('hype.context.resource-view'), {
  getUserPreferences: () => ({ fallbackLocales: ['en', 'zh-hant'] }),
})
const examples = [
  { name: 'Martin Express', size: 200, theme: 'breadline-light' },
  { name: 'Martin Express - Vận Chuyển Quốc Tế', size: 152, theme: 'breadline-light' },
  { name: '場所名稱', size: 200, theme: 'hype-dark' },
]
/** Supply an accepted venue and independent Feature title for visual checks.
 * @param name Venue label. @param index Unique fixture identity.
 * @returns Minimal card data, with unchanged postal text.
 */
function feature(name: string, index: number): Feature {
  return {
    id: `venue-fixture-${index}`,
    i18n: {
      en: {
        title: 'Independent title',
        displayAddress: 'Justen Ctr, 44–52 Wai Ching St, Jordan',
      },
    },
    locationNames: { en: name },
  } as unknown as Feature
}
</script>

<div class="flex flex-wrap items-start gap-8 p-8">
  {#each examples as example, index}
    <div data-theme={example.theme} class="bits-theme bg-panel p-8" data-venue-example>
      <div
        class="bg-[url('/mapStylePreviews/noclit25.png')] bg-cover bg-center"
        style={`width:${example.size}px;height:${example.size}px`}
      >
        <Portal feature={feature(example.name, index)} size={example.size} />
      </div>
    </div>
  {/each}
</div>
