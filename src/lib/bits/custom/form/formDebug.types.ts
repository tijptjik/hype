import type { RemoteFormFields, RemoteFormInput } from '$app/server'

export interface FormDebugProps<T extends RemoteFormInput = RemoteFormInput> {
  form: {
    fields: RemoteFormFields<T>
  }
}
