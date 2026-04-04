export const base = ''
export const assets = ''
export const app_dir = '_app'
export const relative = true
export const initial = {
  base,
  assets,
}
export const initial_base = base
export function override(_paths: { base: string; assets: string }): void {}
export function reset(): void {}
