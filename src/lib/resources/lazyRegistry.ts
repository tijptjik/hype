/**
 * Creates named controllers on first access; enumeration visits only created entries.
 * @param create Factory for a requested controller.
 * @returns An instance-local lazy registry.
 */
export function lazyRegistry<K extends string, V>(create: (key: K) => V): Record<K, V> {
  return new Proxy(Object.create(null) as Record<K, V>, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (!Object.hasOwn(target, key)) target[key as K] = create(key as K)
      return target[key as K]
    },
  })
}
