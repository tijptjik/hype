<script lang="ts">
import type { SearchResultWrapperProps } from '../../search.types'

let { class: className = '', children }: SearchResultWrapperProps = $props()
</script>

<div class={`bits-search__results-wrapper ${className}`}>{@render children?.()}</div>
