type PathSegment = string | number

type SchemaLike = {
  isOptional?: () => boolean
  unwrap?: () => SchemaLike
  safeParse?: (value: unknown) => { success: boolean }
  shape?: Record<string, SchemaLike> | (() => Record<string, SchemaLike>)
  element?: SchemaLike
  options?: SchemaLike[]
  _def?: Record<string, unknown>
  [key: string]: unknown
}

export function toIssueMessages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const messages = value
    .map(issue => {
      if (!issue || typeof issue !== 'object' || !('message' in issue)) return ''
      const message = (issue as { message?: unknown }).message
      return typeof message === 'string' ? message : ''
    })
    .filter(Boolean)
  return messages.length > 0 ? messages : undefined
}

function unwrapSchema(schema: SchemaLike | undefined): SchemaLike | undefined {
  if (!schema) return undefined
  let current = schema
  for (let i = 0; i < 10; i++) {
    if (typeof current.unwrap === 'function') {
      const unwrapped = current.unwrap()
      if (unwrapped === current) break
      current = unwrapped
      continue
    }
    const def = current._def ?? {}
    const innerType = (def.innerType ?? def.schema) as SchemaLike | undefined
    if (innerType && innerType !== current) {
      current = innerType
      continue
    }
    break
  }
  return current
}

function getShape(
  schema: SchemaLike | undefined,
): Record<string, SchemaLike> | undefined {
  if (!schema) return undefined
  const shape = schema.shape ?? schema._def?.shape
  if (typeof shape === 'function') return shape() as Record<string, SchemaLike>
  return shape as Record<string, SchemaLike> | undefined
}

function getSchemaAtPath(
  schema: SchemaLike | undefined,
  path: PathSegment[],
): SchemaLike | undefined {
  let current = schema
  for (const segment of path) {
    const unwrapped = unwrapSchema(current)
    if (!unwrapped) return undefined
    if (typeof segment === 'number') {
      const element = (unwrapped.element ??
        unwrapped._def?.element ??
        unwrapped._def?.type) as SchemaLike | undefined
      current = element
      continue
    }
    const shape = getShape(unwrapped)
    current = shape?.[segment]
  }
  return current
}

function allowsEmpty(schema: SchemaLike | undefined): boolean {
  if (!schema) return false
  if (typeof schema.safeParse === 'function') {
    return schema.safeParse('').success
  }
  const unwrapped = unwrapSchema(schema)
  const options = (unwrapped?.options ?? unwrapped?._def?.options) as
    | SchemaLike[]
    | undefined
  if (!options) return false
  return options.some(option => {
    const value = (option._def?.value ?? option._def?.literal) as unknown
    if (value === '' || value === null || value === undefined) return true
    if (typeof option.isOptional === 'function' && option.isOptional()) return true
    return false
  })
}

export function createSchemaRequiredInferer(
  schema: unknown,
): (path: PathSegment[]) => boolean {
  const requiredCache = new Map<string, boolean>()
  const root = schema as SchemaLike

  return path => {
    const key = path.join('.')
    const cached = requiredCache.get(key)
    if (cached !== undefined) return cached

    const target = getSchemaAtPath(root, path)
    if (!target) {
      requiredCache.set(key, false)
      return false
    }

    const acceptsUndefined =
      typeof target.safeParse === 'function'
        ? target.safeParse(undefined).success
        : typeof target.isOptional === 'function' && target.isOptional()

    const required = !acceptsUndefined && !allowsEmpty(target)

    requiredCache.set(key, required)
    return required
  }
}
