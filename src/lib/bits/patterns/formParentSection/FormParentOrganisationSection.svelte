<script lang="ts">
import FormParentSection from './FormParentSection.svelte'
import type { FormParentSectionProps } from './formParentSection.types'

let props: FormParentSectionProps = $props()
</script>

<FormParentSection {...props} />
