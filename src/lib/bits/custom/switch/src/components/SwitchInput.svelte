<script lang="ts">
import HiddenInput from '$lib/bits/utilities/HiddenInput.svelte'
import { SwitchInputState } from '../switch.svelte.js'

const inputState = SwitchInputState.create()
</script>

{#if inputState.shouldRender}
  <HiddenInput {...inputState.props} />
{/if}
