<script lang="ts">
import { configureForm } from '$lib/factories.svelte'

let formEl: HTMLFormElement | undefined = $state()
let revalidateCalls = $state(0)

type FakeIssue = { message: string; path: Array<string | number> }

let currentValue: Record<string, unknown> = { data: { userRoles: [] } }
let currentIssues: FakeIssue[] | undefined

const fakeForm = {
  fields: {
    set: (value: Record<string, unknown>) => {
      currentValue = value
    },
    value: () => currentValue,
    issues: () => undefined,
    allIssues: () => currentIssues,
  },
  result: undefined,
  validate: async () => {},
  enhance: () => ({}),
  preflight: () => fakeForm,
}

const fakeRemoteForm = {
  for: () => fakeForm,
}

const configured = configureForm(() => ({
  form: fakeRemoteForm as any,
  formEl,
  key: 'submit-attempt-harness',
  data: currentValue,
}))

const formCtx = $derived(configured())

function simulatePreflightFailure(): void {
  formCtx.beginSubmitAttempt()
  currentIssues = [{ message: 'INVALID: test', path: ['data', 'userRoles'] }]
}

function onRoleChangeAfterSubmitAttempt(): void {
  if (!formCtx.wasSubmitAttempted) return
  revalidateCalls += 1
}
</script>

<form bind:this={formEl} data-testid="form"></form>
<button type="button" data-testid="preflight-fail" on:click={simulatePreflightFailure}>
  Fail
</button>
<button
  type="button"
  data-testid="role-change"
  on:click={onRoleChangeAfterSubmitAttempt}
>
  Role
</button>
<div data-testid="is-submit-requested">{String(formCtx.isSubmitRequested)}</div>
<div data-testid="was-submit-attempted">{String(formCtx.wasSubmitAttempted)}</div>
<div data-testid="revalidate-calls">{String(revalidateCalls)}</div>
