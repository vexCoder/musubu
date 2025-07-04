import type { HeadersInit } from 'electron-fetch'
import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { EventEmitter } from 'node:stream'
import fetch from 'electron-fetch'
import { createWriteStream, stat, unlink } from 'fs-extra'

class DownloaderError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'DownloaderError'
  }
}

export interface DownloadProgress {
  progress: number
  downloadedBytes: number
  totalBytes: number | null
}

interface EventMap {
  error: [DownloaderError]
  progress: [DownloadProgress] // Progress percentage
  finish: []
}

export class Downloader extends EventEmitter<EventMap> {
  private downloadedBytes: number = 0
  private totalBytes: number | null = 0
  private isResuming: boolean = false

  constructor(private url: string, private destination: string) {
    super()
    if (!url || !destination) {
      throw new Error('URL and destination path are required for downloading.')
    }
  }

  public async startDownload(): Promise<void> {
    try {
      await this.prepareDownload()
      await this.executeDownload()
    }
    catch (error) {
      await this.cleanupPartialFile()
      const downloadError = new DownloaderError(
        `Failed to download from ${this.url}`,
        error as Error,
      )
      this.emit('error', downloadError)
      throw downloadError
    }
  }

  private async prepareDownload() {
    try {
      const headResponse = await fetch(this.url, { method: 'HEAD' })

      if (!headResponse.ok) {
        throw new DownloaderError(`HTTP Error: ${headResponse.status} ${headResponse.statusText}`)
      }

      const contentLength = headResponse.headers.get('content-length')
      this.totalBytes = contentLength ? Number(contentLength) : null

      // Check if we can resume a partial download
      await this.checkResumability()
    }
    catch (error) {
      if (error instanceof DownloaderError)
        throw error

      console.warn(
        'HEAD request failed or content-length is missing. Progress percentage will not be available.',
      )
      this.totalBytes = null
    }
  }

  private async checkResumability() {
    try {
      const stats = await stat(this.destination)
      if (stats.size > 0 && this.totalBytes) {
        if (stats.size === this.totalBytes) {
          console.log('\nFile is already fully downloaded.')
          throw new DownloaderError('File is already fully downloaded.')
        }
        if (stats.size < this.totalBytes) {
          this.downloadedBytes = stats.size
          this.isResuming = true
          console.log(`\nResuming download from ${this.downloadedBytes} bytes.`)
        }
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error // Rethrow unexpected errors
      }
      // File doesn't exist, which is fine. Start from scratch.
    }
  }

  private async executeDownload() {
    const headers: HeadersInit = this.isResuming
      ? { Range: `bytes=${this.downloadedBytes}-` }
      : {}

    const response = await fetch(this.url, {
      headers,
    })

    if (!response.ok) {
      throw new DownloaderError(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new DownloaderError('Response body is empty.')
    }

    // Use 'a' flag for appending if resuming
    const writer = createWriteStream(this.destination, { flags: this.isResuming ? 'a' : 'w' })
    const stream = response.body as Readable

    stream.on('data', (chunk: Buffer) => {
      this.downloadedBytes += chunk.length
      if (this.totalBytes) {
        const percentage = (this.downloadedBytes / this.totalBytes) * 100
        this.emit('progress', {
          progress: Math.min(percentage, 100), // Ensure percentage does not exceed 100
          downloadedBytes: this.downloadedBytes,
          totalBytes: this.totalBytes,
        })
      }
    })

    stream.pipe(writer)

    return new Promise<void>((resolve, reject) => {
      writer.on('finish', () => {
        this.emit('finish')
        resolve()
      })
      writer.on('error', reject)
      stream.on('error', reject)
    })
  }

  private async cleanupPartialFile(): Promise<void> {
    try {
      await unlink(this.destination)
    }
    catch (error) {
      // Ignore if the file doesn't exist, otherwise log the cleanup error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Error during file cleanup:', error)
      }
    }
  }
}
