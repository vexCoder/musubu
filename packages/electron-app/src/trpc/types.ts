import type { SuperJSONResult } from 'superjson'

export interface TRPCRequest {
  id: number
  method: 'query' | 'mutation' | 'subscription'
  abort?: boolean
  path: string
  input?: SuperJSONResult
}

export interface TRPCResponse {
  id: number
  method: 'query' | 'mutation' | 'subscription'
  path: string
  abort?: boolean
  data?: SuperJSONResult
  error?: SuperJSONResult
}

export interface Subscription {
  id: number
  path: string
  abortController: AbortController
}

export interface Context {
}
