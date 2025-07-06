import type { Buffer } from 'node:buffer'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:stream'
import { createWriteStream, ensureDir } from 'fs-extra'
import yauzl from 'yauzl'

export interface UnzipProgress {
  totalFiles: number
  filesExtracted: number
  totalSize: number
  extractedSize: number
  currentFile: string
  progress: number
}

class UnzipError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'UnzipError'
  }
}

interface EventMap {
  error: [UnzipError]
  progress: [UnzipProgress]
  finish: []
}

export class Unzip extends EventEmitter<EventMap> {
  private zipPath: string
  private outputPath: string

  constructor(
    zipPath: string,
    outputPath: string,
  ) {
    super()

    if (!zipPath || !outputPath) {
      throw new Error('Zip file path and output path are required for unzipping.')
    }

    this.zipPath = zipPath
    this.outputPath = outputPath
  }

  public async extract(): Promise<void> {
    const { entries, totalSize } = await this.getZipMetadata()
    let extractedSize = 0
    let filesExtracted = 0

    // Ensure the output directory exists
    await ensureDir(this.outputPath)

    const openReadStream = (entry: yauzl.Entry): Promise<NodeJS.ReadableStream> => {
      return new Promise((resolve, reject) => {
        this.zipfile.openReadStream(entry, (err, readStream) => {
          if (err)
            return reject(new UnzipError(`Error opening stream for ${entry.fileName}: ${err.message}`))
          resolve(readStream!)
        })
      })
    }

    for (const entry of entries) {
      const destinationPath = join(this.outputPath, entry.fileName)

      if (/\/$/.test(entry.fileName)) {
        // This is a directory, create it
        await ensureDir(destinationPath)
        filesExtracted++
        continue
      }

      // Ensure the directory for the file exists
      await ensureDir(dirname(destinationPath))

      const readStream = await openReadStream(entry)
      const writeStream = createWriteStream(destinationPath)

      readStream.on('data', (chunk: Buffer) => {
        extractedSize += chunk.length
        this.reportProgress(
          entries.length,
          filesExtracted,
          totalSize,
          extractedSize,
          entry.fileName,
        )
      })

      await new Promise<void>((resolve, reject) => {
        readStream.on('end', () => {
          filesExtracted++

          this.reportProgress(
            entries.length,
            filesExtracted,
            totalSize,
            extractedSize,
            entry.fileName,
          )

          resolve()
        })
        readStream.on('error', (err) => {
          const error = new UnzipError(`Read stream error for ${entry.fileName}: ${err.message}`, err)
          this.emit('error', error)
          reject(error)
        })
        writeStream.on('error', (err) => {
          const error = new UnzipError(`Write stream error for ${entry.fileName}: ${err.message}`, err)
          this.emit('error', error)
          reject(error)
        })
        readStream.pipe(writeStream)
      })
    }

    // Final progress report
    this.emit('finish')
  }

  private zipfile!: yauzl.ZipFile

  private getZipMetadata(): Promise<{ entries: yauzl.Entry[], totalSize: number }> {
    return new Promise((resolve, reject) => {
      const entries: yauzl.Entry[] = []
      let totalSize = 0

      yauzl.open(this.zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err || !zipfile) {
          return reject(new UnzipError(`Failed to open zip file: ${err?.message}`))
        }
        this.zipfile = zipfile

        this.zipfile.on('entry', (entry: yauzl.Entry) => {
          entries.push(entry)
          totalSize += entry.uncompressedSize
          this.zipfile.readEntry()
        })

        this.zipfile.on('end', () => {
          resolve({ entries, totalSize })
        })

        this.zipfile.on('error', (err) => {
          reject(new UnzipError(`yauzl error: ${err.message}`))
        })

        this.zipfile.readEntry()
      })
    })
  }

  private lastReportTime = 0
  private reportProgress(
    totalFiles: number,
    filesExtracted: number,
    totalSize: number,
    extractedSize: number,
    currentFile: string,
  ) {
    const now = Date.now()
    // Report progress at most every 100ms or for the very last update
    if (now - this.lastReportTime > 100 || extractedSize === totalSize) {
      const progress = totalSize > 0 ? Math.round((extractedSize / totalSize) * 100) : 100
      this.emit('progress', {
        totalFiles,
        filesExtracted,
        totalSize,
        extractedSize,
        currentFile,
        progress,
      })
      this.lastReportTime = now
    }
  }
}
