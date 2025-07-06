import type { HeadersInit } from 'electron-fetch'
import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { EventEmitter } from 'node:stream'
import fetch from 'electron-fetch'
import { createWriteStream, exists, stat, unlink } from 'fs-extra'

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

interface DownloaderHeadResponse {
  ok: boolean
  status: number
  statusText: string
  etag: string | null
  lastModified: string | null
  contentType: string
  contentLength: number
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
  private isFinished: boolean = false
  private skipResume: boolean = false

  constructor(private url: string, private destination: string) {
    super()
    if (!url || !destination) {
      throw new Error('URL and destination path are required for downloading.')
    }
  }

  public async startDownload(skipResume?: boolean): Promise<void> {
    try {
      this.skipResume = skipResume || false
      this.downloadedBytes = 0
      this.isResuming = false
      this.totalBytes = 0
      this.isFinished = false

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

  public async fetchHead(): Promise<DownloaderHeadResponse> {
    try {
      const response = await fetch(this.url, { method: 'HEAD' })

      if (!response.ok) {
        throw new DownloaderError(`HTTP Error: ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('application/')) {
        throw new DownloaderError('Invalid content type for download.')
      }

      const contentLength = Number(response.headers.get('content-length'))
      if (contentLength && Number.isNaN(contentLength)) {
        throw new DownloaderError('Content length is not a valid number.')
      }

      let etag = response.headers.get('etag') || null
      if (!etag || etag === 'null') {
        throw new DownloaderError('ETag header is missing or invalid.')
      }
      etag = etag.replace(/"|\\"/g, '')

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        etag,
        lastModified: response.headers.get('last-modified') || null,
        contentType,
        contentLength,
      }
    }
    catch (err) {
      const error = err as Error
      let status = 500
      let statusText = 'Network error'

      if ('code' in error) {
        status = error.code === 'ENOTFOUND' ? 404 : 500
        statusText = 'Resource not found'
      }

      if (error instanceof DownloaderError) {
        status = 400
        statusText = error.message
      }

      return {
        ok: false,
        status,
        statusText,
        etag: null,
        lastModified: null,
        contentType: 'application/octet-stream',
        contentLength: 0,
      }
    }
  }

  private async prepareDownload() {
    try {
      const head = await this.fetchHead()

      if (!head.ok) {
        throw new DownloaderError(`HTTP Error: ${head.status} ${head.statusText}`)
      }

      if (await exists(this.destination) && this.skipResume) {
        console.log('Destination file already exists. Skipping resume and starting fresh download.')
        await this.cleanupPartialFile()
        this.downloadedBytes = 0
        this.isResuming = false
      }

      this.totalBytes = head.contentLength

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
          this.isFinished = true
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
    }
  }

  private async executeDownload() {
    console.log(`Starting download from ${this.url} to ${this.destination}`, { isFinished: this.isFinished, isResuming: this.isResuming })
    if (this.isFinished) {
      console.log('Download is already complete. No action taken.')
      this.emit('progress', {
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
      })
      this.emit('finish')
      return
    }

    const headers: HeadersInit = this.isResuming && !this.skipResume
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
