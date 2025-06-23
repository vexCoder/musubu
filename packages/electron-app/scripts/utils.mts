import type { OptionDefinition, ParseOptions } from 'command-line-args'
import parseCommand from 'command-line-args'

type ToObject<T> = T extends { name: infer N, type: { (): infer R } }
  ? N extends string
    ? { [K in N]: R } : never : never

type ToObjectsArray<T> = {
  [I in keyof T]: ToObject<T[I]>
}

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
type FunctionMap<T> = UnionToIntersection<ToObjectsArray<T>[number]>

export function cli<Opts extends OptionDefinition[]>(p: Opts, opts?: ParseOptions): FunctionMap<Opts> {
  return parseCommand(p, opts) as FunctionMap<Opts>
}
