import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'

export interface FormDebugProps<T extends RemoteFormInput = RemoteFormInput> {
  form: RemoteForm<T, unknown>
}
