import type { AppRouter } from '@musubu/electron-app/router'
import type { inferRouterOutputs } from '@trpc/server'

export type InferAsyncIterableOutput<T> = T extends AsyncIterable<infer U> ? U : never

export type RouterType = inferRouterOutputs<AppRouter>

// eslint-disable-next-line ts/no-namespace
export namespace ProcedureOutput {
  export type OnDataSync = InferAsyncIterableOutput<RouterType['sync']['onDatasync']>
}
