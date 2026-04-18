import type { RemoteFormFields, RemoteFormInput } from '@sveltejs/kit'

export interface FormDebugProps<T extends RemoteFormInput = RemoteFormInput> {
  form: {
    fields: RemoteFormFields<T>
  }
}
