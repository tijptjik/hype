<script lang="ts">
import AdminMenuNavigation from '#lib/bits/patterns/bars/adminMenu/AdminMenuNavigation.svelte'
import Icon from '#lib/bits/custom/icon/TemplateIcon.svelte'
let count = $state(12)
let narrow = $state(false)
const items = $derived(
  Array.from({ length: count }, (_, i) => ({
    href: `#view-${i}`,
    label: `View ${i + 1}`,
    icon: Icon,
  })),
)
</script>
<div class="bits-theme bg-base-100 p-4">
  <button type="button" onclick={() => (count = 5)}>Five views</button>
  <button type="button" onclick={() => (count = 6)}>Six views</button>
  <button type="button" onclick={() => (narrow = !narrow)}>Collapse prism</button>
  <div
    class="bg-base-100 fixed bottom-4 left-4 rounded-xl border"
    style:width={narrow ? '72px' : '380px'}
  >
    <div class="h-64">Prism content</div>
    <AdminMenuNavigation {items} isNarrow={narrow} pathname="/" />
  </div>
</div>
