import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export type CssVarMap = Record<`--${string}`, string>

export function cx(...parts: Array<ClassValue>): string {
  return twMerge(clsx(parts))
}

export function cssVars(...sets: Array<CssVarMap | false | null | undefined>): string {
  return sets
    .filter((set): set is CssVarMap => Boolean(set))
    .flatMap(vars => Object.entries(vars).map(([name, value]) => `${name}: ${value};`))
    .join(' ')
}
