<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { Icon } from '@steeze-ui/svelte-icon';
import { XCircle } from '@steeze-ui/heroicons';
</script>

<li>
  <a class="btn btn-ghost pl-3 pr-4">
    <Icon src={XCircle} class="h-6 w-6" />
    {m.forms__reset()}
  </a>
</li>
<li><a class="btn btn-primary">{m.forms__save()}</a></li>
