# Interface icons

Review the applied migration at `/themes/icons`. The catalogue is a source-file inventory of pre-migration `virtual:icons` imports, excluding the existing admin style galleries. Its counts represent files, not rendered instances. The application now uses the selected replacements; the comparison keeps the original artwork for reference.

## Loading and bundle size

Use a static, per-icon import:

```svelte
<script lang="ts">
import Search from 'virtual:icons/proicons/search'
import Icon from '$lib/bits/custom/icon/Icon.svelte'
</script>

<Icon src={Search} size="md" aria-hidden="true" />
```

The existing `Icons({ compiler: 'svelte' })` configuration in `vite.config.ts` compiles the selected SVG into a Svelte component at build time. `@iconify/json` already supplies Proicons as a development dependency. No additional package, icon API request, font download or asynchronous icon loader is required. SSR includes the SVG in the initial HTML; client navigation loads it as part of the route's normal module dependencies. SVG markup still contributes bytes and rendering work: this avoids a separate icon-loading phase, rather than making icons cost-free.

Keep imports static and local to the consuming component/module. Do not import the review catalogue into application components: it intentionally includes both families for comparison. Avoid collection-wide registries, dynamic `import()` loaders and runtime Iconify fetches. Vite can share repeated imports and include only referenced icons; the entire Iconify dataset does not ship to the browser.

## Visual and semantic choices

Use Proicons at its native stroke weight; start with 20 px for controls and 24 px for prominent actions. Use the shared Icon wrapper for sizing and tone. Do not globally force Lucide's stroke width or apply `filled` to outlined artwork. Compare at 16 px before using an icon in dense rows.

Keep brand, flag and licence artwork authoritative. Retain Lucide `ghost`, `grip-vertical`, `list-plus`, `copy-check` and `copy-x`. Use Proicons `location` for map-pinned, `menu` for menu, and `bullet-list-square` for panel-top-bottom-dashed. Tabler supplies flame, language and user-minus where Proicons lacks the corresponding semantic cue; Simple Icons supplies LinkedIn. Give icon-only buttons an accessible name; hide decorative SVGs from assistive technology.

The review catalogue lives alongside its route in `src/routes/themes/icons/comparisons.ts`, with explicit imports, replacement identifiers, rationale and source paths. Its source paths and counts record the pre-migration inventory. The current import inventory is shown at `/admin/styles/icons`.
