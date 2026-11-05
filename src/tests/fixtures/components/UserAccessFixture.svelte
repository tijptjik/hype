<script lang="ts">
// BITS COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import UserAccess from '#lib/bits/patterns/userDirectory/UserAccess.svelte'
// TYPES
import type { UserAccessOverview } from '#lib/users/access.types.js'

let { access }: { access: UserAccessOverview } = $props()
</script>

<Main.Form
  ><FormSurface><UserAccess {access} /></FormSurface></Main.Form
>
