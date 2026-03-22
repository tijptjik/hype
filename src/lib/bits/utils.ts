export type CssVarMap = Record<`--${string}`, string>

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function cssVars(...sets: Array<CssVarMap | false | null | undefined>): string {
  return sets
    .filter((set): set is CssVarMap => Boolean(set))
    .flatMap(vars => Object.entries(vars).map(([name, value]) => `${name}: ${value};`))
    .join(' ')
}
