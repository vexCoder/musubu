import type { RemoteInfo, Socket } from 'node:dgram'
import { Buffer } from 'node:buffer'
import { createSocket } from 'node:dgram'

// For clarity, define the types for the response and the queue item
export interface UdpResponse extends RemoteInfo {
  data: string
}

interface QueueItem {
  command: string
  expectResponse: boolean // <-- The key addition
  resolve: (value: UdpResponse | void) => void
  reject: (reason?: any) => void
}

export interface SendMethod {
  (command: string): Promise<void>
  expectResponse: (command: string) => Promise<UdpResponse>
}

export class UdpClient {
  private readonly requestQueue: QueueItem[] = []
  private isProcessing = false
  private socket: Socket

  // --- The public API ---
  public readonly send: SendMethod

  constructor(
    private host: string = 'localhost',
    private port: number = 55355,
  ) {
    this.socket = createSocket('udp4')
    this.socket.on('error', (err) => {
      console.error(`UDPMessageService: Socket error: ${err.message}`)
    })

    const sendWithoutResponse = (command: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({
          command,
          expectResponse: false,
          reject,
          resolve: resolve as (value: UdpResponse | void) => void, // Cast to match the expected type
        })
        this.processNext()
      })
    }

    const sendWithResponse = (command: string): Promise<UdpResponse> => {
      return new Promise<UdpResponse>((resolve, reject) => {
        this.requestQueue.push({
          command,
          expectResponse: true,
          // Cast is needed because the promise is specifically for UdpResponse
          resolve: resolve as (value: UdpResponse | void) => void,
          reject,
        })
        this.processNext()
      })
    }

    // Create the main function, which defaults to no response
    const sender = sendWithoutResponse as SendMethod

    // Attach the expectResponse function as a property
    sender.expectResponse = sendWithResponse

    // Assign the fully constructed method to the class instance
    this.send = sender
  }

  /**
   * Processes the next item in the queue. This function is the core of the solution,
   * ensuring only one request is handled at a time.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return
    }

    this.isProcessing = true
    const currentItem = this.requestQueue.shift()!

    // --- LOGIC FOR COMMANDS THAT EXPECT A RESPONSE ---
    if (currentItem.expectResponse) {
      let timeoutId: NodeJS.Timeout

      const messageHandler = (msg: Buffer, rinfo: RemoteInfo) => {
        clearTimeout(timeoutId)
        currentItem.resolve({ ...rinfo, data: msg.toString() })
        this.finishProcessing()
      }

      timeoutId = setTimeout(() => {
        this.socket.removeListener('message', messageHandler)
        currentItem.reject(new Error(`UDP: Response for "${currentItem.command}" timed out.`))
        this.finishProcessing()
      }, 5000)

      this.socket.once('message', messageHandler)
    }

    this.socket.send(Buffer.from(currentItem.command), this.port, this.host, (err) => {
      if (err) {
        currentItem.reject(err)
        this.finishProcessing()
        return
      }

      if (!currentItem.expectResponse) {
        currentItem.resolve()
        this.finishProcessing()
      }
    })
  }

  /**
   * A helper to clean up the state and trigger the next item in the queue.
   */
  private finishProcessing(): void {
    this.isProcessing = false
    this.processNext() // Attempt to process the next item
  }
}

export const udp = new UdpClient()
