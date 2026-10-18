// TYPES

/* ----------------- */
// USERS :: JOIN
/* -------- */

// Used to distriminate between Organisation and Project roles

// Used to manage organisation core inclusion in hubs

export type QueryWithOverride<TCurrent = unknown, TResult = unknown> = {
  withOverride(update: (current: TCurrent) => TCurrent): TResult
}

export type ResourceSubmitMode = 'create' | 'replace' | 'update'

type ResourceSubmitMetaDraft = {
  id?: unknown
  mode?: unknown
  licenseTouched?: unknown
}

export type ResourceSubmitDraft<TData extends Record<string, unknown>> = {
  meta?: ResourceSubmitMetaDraft
  data?: TData
}

export type ChangedRelationResolution<TEffective> = {
  effective: TEffective
  changed: boolean
}

export type ResolveChangedRelationParams<TEffective> = {
  submittedValue: unknown
  currentValue: unknown
  baselineValue: unknown
  toEffective: (params: {
    submittedValue: unknown
    currentValue: unknown
  }) => TEffective
  toComparableEffective: (value: TEffective) => unknown
  toComparableBaseline: (value: unknown) => unknown
  toSignature: (value: unknown) => string
}

export type ApplyChangedRelationFieldParams<
  TData extends Record<string, unknown>,
  TKey extends keyof TData,
  TEffective,
> = {
  data: TData
  key: TKey
} & ResolveChangedRelationParams<TEffective>
