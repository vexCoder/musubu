import type { AppRouter } from '@core/router.js'
import type { AnyRouter } from '@trpc/server'
import type { Context, Subscription, TRPCRequest, TRPCResponse } from '@trpc/types' // Assume types are in a separate file
import { callTRPCProcedure, getTRPCErrorShape, TRPCError } from '@trpc/server'
import { isObservable, observableToAsyncIterable } from '@trpc/server/observable'
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import'
import { trpc } from '@trpc/trpc'
import { WindowManager } from '@window/WindowManager'
import { ipcMain } from 'electron'
import superjson from 'superjson'

/**
 * A type-safe, modular, and robust handler for proxying tRPC requests
 * from Electron's renderer process to the main process via IPC.
 *
 * @template TRouter The tRPC router type.
 */
export class TrpcIpcManager<
  TRouter extends AnyRouter,
> {
  private readonly router: TRouter
  private readonly subscriptions = new Map<string | number, Subscription>()
  private readonly createContext: () => Promise<Omit<Context, 'windows'>>

  /**
   * Initializes the tRPC IPC handler.
   * @param opts The options for creating the handler.
   * @param opts.router The tRPC app router.
   * @param opts.windows An array of BrowserWindows to broadcast events to.
   * @param opts.createContext A function to create the tRPC context.
   */
  constructor(opts: {
    router: TRouter
    createContext: () => Promise<Omit<Context, 'windows'>>
  }) {
    this.router = opts.router

    this.createContext = opts.createContext

    ipcMain.handle('trpc', this.handleRequest.bind(this))
  }

  static createTrpcHandler<
    TRouter extends AppRouter,
  >(opts: {
    router: TRouter
    createContext: () => Promise<Omit<Context, 'windows'>>
  },
  ): TrpcIpcManager<TRouter> {
    return new TrpcIpcManager(opts)
  }

  /**
   * Cleans up all active subscriptions and removes the IPC listener.
   * Essential for graceful shutdown.
   */
  public dispose(): void {
    ipcMain.removeHandler('trpc')
    for (const sub of this.subscriptions.values()) {
      sub.abortController.abort()
    }
    this.subscriptions.clear()
  }

  /**
   * Primary request handler invoked by IPC.
   * It dynamically routes requests to the appropriate handler based on the operation type.
   */
  private async handleRequest(_: Electron.IpcMainInvokeEvent, req: TRPCRequest): Promise<TRPCResponse | void> {
    const { id, method } = req

    if (!id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Request ID is required',
      })
    }

    try {
      switch (method) {
        case 'query':
        case 'mutation':
          return await this.handleQueryOrMutation(req)
        case 'subscription':
          if (req.abort) {
            this.stopSubscription(id)
            return
          }

          return await this.handleSubscription(req)
        default:
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unsupported tRPC operation type: ${method}`,
          })
      }
    }
    catch (error) {
      return this.serializeError(req, error as TRPCError)
    }
  }

  private async makeCaller() {
    const ctx = await this.createContext()
    const createCaller = trpc.createCallerFactory(this.router)
    const caller = createCaller(ctx)
    return caller
  }

  /**
   * Handles incoming queries and mutations.
   */
  private async handleQueryOrMutation(req: TRPCRequest): Promise<TRPCResponse> {
    const { id, path, method, input } = req
    const deserializedInput = input ? superjson.deserialize(input) : undefined
    const ctx = await this.createContext()

    try {
      const result = await callTRPCProcedure({
        router: this.router,
        path,
        getRawInput: async () => deserializedInput,
        ctx,
        type: method,
        signal: undefined,
      })

      const isIterableResult
          = isAsyncIterable(result) || isObservable(result)

      if (isIterableResult) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Expected a single result for ${method} at path "${path}", but received an iterable.`,
        })
      }

      return {
        id,
        method,
        path,
        data: superjson.serialize(result), // For compatibility with older clients
      }
    }
    catch (error) {
      return this.serializeError(req, error as TRPCError)
    }
  }

  /**
   * Manages subscription lifecycle: creation and initial data stream.
   */
  private async handleSubscription(req: TRPCRequest): Promise<void> {
    const { id, path, input, method } = req
    if (this.subscriptions.has(id)) {
      // Prevent duplicate subscriptions
      return
    }

    const ctx = await this.createContext()
    const deserializedInput = input ? superjson.deserialize(input) : undefined

    try {
      const abortController = new AbortController()

      const result = await callTRPCProcedure({
        router: this.router,
        path,
        getRawInput: async () => deserializedInput,
        ctx,
        type: method,
        signal: abortController.signal,
      })

      const isIterableResult
          = isAsyncIterable(result) || isObservable(result)

      if (!isIterableResult) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Expected an AsyncIterable or Observable for subscription at path "${path}"`,
        })
      }

      const existing = this.subscriptions.get(id)

      if (existing) {
        existing.abortController.abort()
        this.subscriptions.delete(id)
      }

      const subscription: Subscription = {
        id,
        abortController,
        path,
      }

      this.subscriptions.set(id, subscription)

      const observable = isObservable(result)
        ? observableToAsyncIterable(result, abortController.signal)
        : result

      this.runSubscription(req, observable, abortController.signal)
    }
    catch (error) {
      this.broadcast(this.serializeError(req, error as TRPCError))
    }
  }

  /**
   * Executes the subscription, iterating over the async generator and broadcasting data.
   */
  private async runSubscription(req: TRPCRequest, observable: AsyncIterable<unknown>, signal: AbortSignal): Promise<void> {
    try {
      for await (const data of observable) {
        if (signal.aborted)
          return
        this.broadcast({
          id: req.id,
          method: 'subscription',
          path: req.path,
          data: superjson.serialize(data), // For compatibility with older clients
        })
      }
      // Subscription ended gracefully
      this.broadcast({ id: req.id, method: 'subscription', abort: true, path: req.path, data: superjson.serialize(null) })
    }
    catch (error) {
      if (signal.aborted)
        return
      this.broadcast(this.serializeError(req, error as TRPCError))
    }
    finally {
      this.stopSubscription(req.id)
    }
  }

  /**
   * Stops and removes a single subscription.
   */
  private stopSubscription(id: string | number): void {
    const sub = this.subscriptions.get(id)
    if (sub) {
      sub.abortController.abort()
      this.subscriptions.delete(id)
    }
  }

  /**
   * Serializes an error into a tRPC-compliant response message.
   */
  private serializeError(req: TRPCRequest, error: TRPCError): TRPCResponse {
    const shape = getTRPCErrorShape({
      config: this.router._def._config,
      error,
      type: 'subscription',
      path: req.path,
      input: req.input,
      ctx: undefined, // Context is not needed for error serialization
    })

    return {
      id: req.id,
      method: req.method,
      path: req.path,
      error: superjson.serialize(shape),
    }
  }

  /**
   * Broadcasts a tRPC message to all managed renderer windows.
   */
  private broadcast(message: TRPCResponse): void {
    for (const window of WindowManager.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('trpc-message', message)
      }
    }
  }
}
