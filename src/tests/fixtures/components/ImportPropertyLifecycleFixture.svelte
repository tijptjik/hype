<script lang="ts">
import PropertyCreationStep from '#lib/bits/patterns/import/components/features/steps/properties/PropertyCreationStep.svelte'
let { onComplete, translate = false }: { onComplete: () => void; translate?: boolean } =
  $props()
let footerAction = $state<(() => void) | undefined>()
</script>
<button type="button" onclick={() => footerAction?.()}>Create test property</button>
<PropertyCreationStep
  property={{
    key: 'note',
    scenario: 3,
    columns: [
      {
        header: 'note',
        sampleValues: ['A note'],
        modelType: 'Property',
        field: 'value',
        locale: translate ? 'en' : 'None',
        propertyType: 'specifier',
      },
    ],
  }}
  onActionComplete={onComplete}
  bind:footerAction
/>
