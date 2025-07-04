import type { DownloadProgress } from '@lib/Downloader'
import type { UnzipProgress } from '@lib/Unzip'
import type { XmlProgress } from '@lib/XmlParser'
import { EventEmitter, on } from 'node:events'
import { resolve } from 'node:path'
import { Downloader } from '@lib/Downloader'
import { Paths } from '@lib/paths'
import { Unzip } from '@lib/Unzip'
import { streamParseXml } from '@lib/XmlParser'
import { exists, unlink } from 'fs-extra'
import _ from 'lodash'
import { DbSaver } from '@/lib/DbSaver'

enum DataSyncType {
  download = 'download',
  unzip = 'unzip',
  parseXml = 'parseXml',
  saveToDb = 'saveToDb',
}

enum DataSyncEventType {
  progress = 'progress',
  error = 'error',
  finish = 'finish',
}

interface DataSyncEventPayload {
  type: DataSyncType
  event: DataSyncEventType
  payload: DataSyncProgress | Error | null | undefined | void
}

export type DataSyncProgress = DownloadProgress | UnzipProgress | XmlProgress

interface XmlProgressEventPayload {
  type: 'parseXml'
  event: 'progress'
  payload: XmlProgress
}

interface DownloadProgressEventPayload {
  type: 'download'
  event: 'progress'
  payload: DownloadProgress
}

interface UnzipProgressEventPayload {
  type: 'unzip'
  event: 'progress'
  payload: UnzipProgress
}

interface SaveToDbProgressEventPayload {
  type: 'saveToDb'
  event: 'progress'
  payload: {
    progress: number
    savedCount: number
    totalPending: number
    type: 'Save' | 'Append'
  }
}

export type DataSyncProgressEventPayload = XmlProgressEventPayload | DownloadProgressEventPayload | UnzipProgressEventPayload | SaveToDbProgressEventPayload

interface DataSyncEventMap {
  progress: [DataSyncProgressEventPayload]
}

interface EmitterItem {
  emitter: EventEmitter
  type: DataSyncType
  start: () => Promise<void>
}

async function* chainEmitters(...emitters: EmitterItem[]): AsyncGenerator<DataSyncEventPayload> {
  for (const { emitter, start, type } of emitters) {
    const controller = new AbortController()
    const signal = controller.signal

    start()

    // A handler to signal completion and clean up.
    const onEnd = () => {
      controller.abort() // This terminates the `for await...of` loop below.
    }

    emitter.once('finish', onEnd)

    try {
      // Create an async iterator for 'data' events.
      // It will automatically stop when the signal is aborted.
      const eventIterator = on(emitter, 'progress', { signal })

      // Yield all events from the current emitter.
      // This loop will not exit until the 'end' event is fired.
      for await (const [value] of eventIterator) {
        yield {
          type,
          event: DataSyncEventType.progress, // Assuming all events are progress events.
          payload: value!, // Type assertion for the event payload.
        } // Pass the event data to the consumer.
      }

      yield {
        type,
        event: DataSyncEventType.finish,
        payload: undefined,
      }
    }
    catch (err) {
      // The AbortError is expected when we call controller.abort().
      // We only re-throw other, unexpected errors.
      if ((err as Error).name !== 'AbortError') {
        yield {
          type,
          event: DataSyncEventType.error,
          payload: err as Error,
        }
      }
    }
    finally {
      emitter.removeListener('finish', onEnd)
    }
  }
}

export class DataSyncService extends EventEmitter<DataSyncEventMap> {
  private static instance: DataSyncService | null = null
  private downloadUrl = 'https://gamesdb.launchbox-app.com/Metadata.zip'
  private downloadDestination = resolve(Paths.userData, 'Metadata.zip')
  private unzipDestination = resolve(Paths.userData, 'Metadata')
  private xmlPath = resolve(this.unzipDestination, 'Metadata.xml')
  // private xmlPath = 'J:\\Projects\\ts\\musubu\\.test\\xml-schema\\xml\\Sample.xml'

  constructor(
    private downloaderFactory: (url: string, destination: string) => Downloader = (url, dest) => new Downloader(url, dest),
    private unzipperFactory: (zipPath: string, outputPath: string) => Unzip = (zipPath, outPath) => new Unzip(zipPath, outPath),
    private dbSaver = new DbSaver(),
  ) {
    super()
  }

  public static getInstance(): DataSyncService {
    if (!DataSyncService.instance) {
      throw new Error('DataSyncService has not been initialized. Call run() first.')
    }
    return DataSyncService.instance
  }

  private getDownloaderEmitterItem(url: string, destination: string): EmitterItem {
    const downloader = this.downloaderFactory(url, destination)

    return {
      emitter: downloader,
      type: DataSyncType.download,
      start: downloader.startDownload.bind(downloader),
    }
  }

  private getUnzipEmitterItem(zipPath: string, outputPath: string): EmitterItem {
    const unzip = this.unzipperFactory(zipPath, outputPath)

    return {
      emitter: unzip,
      type: DataSyncType.unzip,
      start: unzip.extract.bind(unzip),
    }
  }

  private getXmlParserEmitterItem(xmlPath: string): EmitterItem {
    const emitter = new EventEmitter<{
      progress: [XmlProgress]
      error: [Error]
      finish: []
    }>()

    const start = async () => {
      const iterator = streamParseXml({
        filePath: xmlPath,
        recordTags: ['Game', 'Platform', 'PlatformAlternateName', 'GameAlternateName', 'GameImage'],
        onError(error) {
          emitter.emit('error', error)
        },
        filter(data) {
          if (data.type === 'Game' || data.type === 'Platform') {
            const name = `${data.Name}` as string
            return !!name && name.trim() !== ''
          }

          return true
        },
        // eslint-disable-next-line ts/no-explicit-any
        onData: async ({ type, ...rest }: any) => this.dbSaver.addData(type, rest),
      })

      for await (const event of iterator) {
        emitter.emit('progress', event)
      }
      emitter.emit('finish')
    }

    return {
      emitter,
      type: DataSyncType.parseXml,
      start,
    }
  }

  private getSaveToDbEmitterItem(): EmitterItem {
    const start = async () => {
      this.dbSaver.resumeQueue()
    }

    return {
      emitter: this.dbSaver,
      type: DataSyncType.saveToDb,
      start,
    }
  }

  public static initialize() {
    if (!DataSyncService.instance) {
      DataSyncService.instance = new DataSyncService()
    }

    return DataSyncService.instance
  }

  public async run() {
    if (await exists(resolve(Paths.userData, 'Metadata.zip'))) {
      await unlink(resolve(Paths.userData, 'Metadata.zip'))
    }

    const downloader = this.getDownloaderEmitterItem(this.downloadUrl, this.downloadDestination)
    const unzipper = this.getUnzipEmitterItem(
      this.downloadDestination,
      this.unzipDestination,
    )
    const xmlParser = this.getXmlParserEmitterItem(this.xmlPath)
    const dbSaver = this.getSaveToDbEmitterItem()

    const chain = chainEmitters(downloader, unzipper, xmlParser, dbSaver)
    // const chain = chainEmitters(xmlParser, dbSaver)

    const throttled = _.throttle((event: DataSyncEventPayload) => {
      this.emit('progress', {
        event: DataSyncEventType.progress,
        type: event.type,
        payload: event.payload,
      } as DataSyncProgressEventPayload)
    }, 1250)

    for await (const event of chain) {
      if (event.type === DataSyncType.unzip && event.event === DataSyncEventType.finish) {
        await unlink(this.downloadDestination)
      }

      if (event.event === DataSyncEventType.progress) {
        throttled(event)
      }
      if (event.event === DataSyncEventType.error) {
        console.error('Data sync error:', event.payload)
        return
      }
    }

    console.log('Data sync completed successfully.')
  }
}
