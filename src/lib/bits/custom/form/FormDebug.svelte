<script lang="ts" generics="T extends RemoteFormInput">
import type { RemoteFormFields, RemoteFormInput } from '@sveltejs/kit'
import type { FormDebugProps } from './formDebug.types'

const { form }: FormDebugProps<T> = $props()

const fields = $derived(form.fields as RemoteFormFields<RemoteFormInput>)
</script>

<pre class="bits-form__debug-output">
{JSON.stringify(
    {
      values: fields.value(),
      issues: fields.allIssues(),
    },
    null,
    2,
  )}
</pre>
