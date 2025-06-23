import type { TRPCRequest, TRPCResponse } from '@musubu/electron-app/trpc'
import type { AppRouter } from '@musubu/electron-app/trpc/router'
import type { Operation, TRPCLink } from '@trpc/client'
import type { TRPCError } from '@trpc/server'
import type { Observer } from '@trpc/server/observable'
import { TRPCClientError } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { observable } from '@trpc/server/observable'
import superjson from 'superjson'

// Assume a preload script exposes these IPC functions safely
declare global {
  interface Window {
    app: {
      send: (req: TRPCRequest) => Promise<TRPCResponse | void>
      receive: (callback: (res: TRPCResponse) => void) => () => void
    }
  }
}

interface ActiveOperation {
  op: Operation
  observer: Observer<any, any>
}

/**
 * Manages the lifecycle of tRPC operations over Electron IPC.
 * This class encapsulates state and provides a robust, reusable TRPCLink.
 */
class ElectronLinkManager {
  private activeOperations = new Map<number, ActiveOperation>()

  constructor() {
    // Set up a single, persistent listener for all subscription messages
    window.app.receive(this.handleIncomingMessage.bind(this))
  }

  /**
   * The public TRPCLink instance to be used by the tRPC client.
   */
  public link: TRPCLink<AppRouter> = () => {
    return ({ op }) =>
      observable((observer) => {
        this.activeOperations.set(op.id, { op, observer })

        this.sendRequest(op).catch((error) => {
          observer.error(TRPCClientError.from(error))
          this.cleanupOperation(op.id)
        })

        // Return the unsubscribe handler
        return () => {
          this.handleUnsubscribe(op)
        }
      })
  }

  /**
   * Sends the operation to the main process.
   * Queries/mutations are handled via invoke/handle, returning a direct response.
   * Subscriptions are fire-and-forget, with responses arriving via the message listener.
   */
  private async sendRequest(op: Operation): Promise<void> {
    const request: TRPCRequest = {
      id: op.id,
      method: op.type,
      path: op.path,
      input: superjson.serialize(op.input),
    }

    const response = await window.app.send(request)

    // Direct responses are only for queries and mutations.
    // Subscription data arrives via the `handleIncomingMessage` listener.
    if (response) {
      this.processResponse(response)
    }
  }

  /**
   * Handles all unsolicited messages from the main process (e.g., subscription data/errors).
   */
  private handleIncomingMessage(response: TRPCResponse): void {
    // The response from the main process is already a complete TrpcResponse object.
    // No need to deserialize the whole thing, just its payload.
    this.processResponse(response)
  }

  /**
   * Centralized logic to process any response and notify the correct observer.
   */
  private processResponse(response: TRPCResponse): void {
    const operation = this.activeOperations.get(response.id)
    if (!operation)
      return // Operation may have been unsubscribed

    const { observer } = operation
    const { method, data, error } = response

    if (error) {
      const cause = error ? superjson.deserialize(error) : new Error('Unknown IPC error')
      observer.error(TRPCClientError.from(cause as TRPCError))
      this.cleanupOperation(response.id)
      return
    }

    if (data) {
      observer.next({
        result: {
          type: 'data',
          data: data ? superjson.deserialize(data) : undefined,
        },
      })
      // Non-subscription operations are one-and-done
      if (operation.op.type !== 'subscription') {
        this.cleanupOperation(response.id)
      }
    }
    else if (method === 'subscription' && response.abort) {
      this.cleanupOperation(response.id)
    }
  }

  /**
   * Handles the teardown logic when a component unsubscribes from an operation.
   */
  private handleUnsubscribe(op: Operation): void {
    if (op.type === 'subscription') {
      // Explicitly tell the backend to stop this subscription
      const stopRequest: TRPCRequest = {
        id: op.id,
        method: 'subscription',
        abort: true, // Indicate this is a stop request
        path: op.path, // Include for context, matching the backend's `op`
      }
      window.app.send(stopRequest)
    }
    this.cleanupOperation(op.id)
  }

  /**
   * Completes the observer and removes the operation from the active map.
   */
  private cleanupOperation(id: number): void {
    const operation = this.activeOperations.get(id)
    if (operation) {
      operation.observer.complete()
      this.activeOperations.delete(id)
    }
  }
}

// --- Usage in your app ---

// Create a single instance of the manager to be used throughout the app
const linkManager = new ElectronLinkManager()

// Export the link instance for the tRPC client setup
export const electronLink = linkManager.link
// You would also still export the main trpc object for use in components
export const trpc = createTRPCReact<AppRouter>()
