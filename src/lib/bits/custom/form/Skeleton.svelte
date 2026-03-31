<script lang="ts">
let {
  isLabelCovered = true,
  class: className = '',
}: {
  isLabelCovered?: boolean
  class?: string
} = $props()

const wrapperClass = $derived(['bits-form__field', className].filter(Boolean).join(' '))
const controlClass = $derived(
  [
    'bits-form__control-wrap bits-form__control-wrap--skeleton',
    isLabelCovered ? 'bits-form__control-wrap--skeleton-label-covered' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<div class={wrapperClass} aria-hidden="true">
  <div class={controlClass}></div>
</div>
