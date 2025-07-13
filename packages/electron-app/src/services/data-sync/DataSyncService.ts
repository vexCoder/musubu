import type { UnzipProgress } from '@lib/Unzip'
import type { XmlProgress } from '@lib/XmlParser'
import type { DownloadProgress } from '@services/DownloaderService'
import { EventEmitter, on } from 'node:events'
import { resolve } from 'node:path'
import { Paths } from '@lib/paths'
import { Unzip } from '@lib/Unzip'
import { streamParseXml } from '@lib/XmlParser'
import { ParsedDataDbService } from '@services/data-sync/ParsedDataDbService'
import { Downloader } from '@services/DownloaderService'
import { CronJob } from 'cron'
import dayjs from 'dayjs'
import { unlink } from 'fs-extra'
import _ from 'lodash'
import { Settings } from '@/core/settings'

enum DataSyncType {
  checkForUpdates = 'checkForUpdates',
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
  payload: DownloadProgress | UnzipProgress | XmlProgress | Error | null | undefined | void
}

interface StartPayload {
  isFirstRun: boolean
  isUpdateAvailable: boolean
}

export type DataSyncRendererPayload = {
  type: 'checkForUpdates'
  event: 'start'
  payload: StartPayload
} | {
  type: 'checkForUpdates'
  event: 'finish'
  payload: {
    error?: Error
  }
} | {
  type: 'download'
  event: 'progress'
  payload: DownloadProgress
} | {
  type: 'unzip'
  event: 'progress'
  payload: UnzipProgress
} | {
  type: 'parseXml'
  event: 'progress'
  payload: XmlProgress
} | {
  type: 'saveToDb'
  event: 'progress'
  payload: {
    type: 'Append' | 'Save'
    progress: number
  }
}

interface DataSyncEventMap {
  update: [DataSyncRendererPayload]
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
  private static isRunning = false
  private readonly downloader: Downloader
  private readonly unzipper: Unzip
  private readonly saver: ParsedDataDbService

  constructor(
    private downloadUrl: string,
    private downloadDestination: string,
    private unzipDestination: string,
    private xmlPath: string,
    private readonly settings = Settings,
  ) {
    super()

    this.downloader = new Downloader(this.downloadUrl, this.downloadDestination)
    this.unzipper = new Unzip(this.downloadDestination, this.unzipDestination)
    this.saver = new ParsedDataDbService()
  }

  public static getInstance(): DataSyncService {
    if (!DataSyncService.instance) {
      throw new Error('DataSyncService has not been initialized. Call run() first.')
    }
    return DataSyncService.instance
  }

  private getDownloaderEmitterItem(skipResume?: boolean): EmitterItem {
    return {
      emitter: this.downloader,
      type: DataSyncType.download,
      start: this.downloader.startDownload.bind(this.downloader, skipResume),
    }
  }

  private getUnzipEmitterItem(): EmitterItem {
    return {
      emitter: this.unzipper,
      type: DataSyncType.unzip,
      start: this.unzipper.extract.bind(this.unzipper),
    }
  }

  private getXmlParserEmitterItem(): EmitterItem {
    const emitter = new EventEmitter<{
      progress: [XmlProgress]
      error: [Error]
      finish: []
    }>()

    const start = async () => {
      const iterator = streamParseXml({
        filePath: this.xmlPath,
        recordTags: ['Game', 'Platform', 'PlatformAlternateName', 'GameAlternateName', 'GameImage'],
        onError(error) {
          emitter.emit('error', error)
        },
        filter(data) {
          if (data.type === 'Game' || data.type === 'Platform') {
            if (data.Name == null) {
              logger.warn(`Skipping ${data.type} with missing Name field:`, data)
              return false
            }

            return `${data.Name}`.trim() !== ''
          }

          return true
        },
        // eslint-disable-next-line ts/no-explicit-any
        onData: async ({ type, ...rest }: any) => this.saver.addData(type, rest),
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
      this.saver.resumeQueue()
    }

    return {
      emitter: this.saver,
      type: DataSyncType.saveToDb,
      start,
    }
  }

  public static initialize() {
    if (!DataSyncService.instance) {
      const downloadUrl = 'https://gamesdb.launchbox-app.com/Metadata.zip'
      const downloadDestination = resolve(Paths.userData, 'Metadata.zip')
      const unzipDestination = resolve(Paths.userData, 'Metadata')
      const xmlPath = resolve(unzipDestination, 'Metadata.xml')
      // const xmlPath = 'J:\\Projects\\ts\\musubu\\.test\\xml-schema\\xml\\Sample.xml'

      DataSyncService.instance = new DataSyncService(
        downloadUrl,
        downloadDestination,
        unzipDestination,
        xmlPath,
      )

      const execute = DataSyncService.instance.run.bind(DataSyncService.instance)

      const job = CronJob.from({
        cronTime: '00 00 * * * *',
        onTick: async () => {
          try {
            logger.info('Executing sync job...')
            const nextInvocation = job.nextDate().toUnixInteger()
            logger.info(`Next invocation of sync job: ${dayjs.unix(nextInvocation).format('YYYY-MM-DD HH:mm:ss')}`)
            await execute()
          }
          catch (error) {
            logger.error('Error during scheduled data sync:', error)
          }
        },
        start: true,
        timeZone: 'UTC',
      })
    }

    return DataSyncService.instance
  }

  public async checkForUpdates() {
    const head = await this.downloader.fetchHead()

    if (!head.ok || head.status !== 200 || !head.etag || !head.contentLength || head.contentLength <= 0) {
      throw new Error(`Failed to check for updates: ${head.status} ${head.statusText}`)
    }

    const currentEtag = this.settings.get('gamesDbVersion')

    if (currentEtag === head.etag) {
      logger.info('No updates available. Current version is up-to-date.')
      return {
        isUpdateAvailable: false,
        currentVersion: currentEtag,
      }
    }

    logger.info('Updates available. Current version: %s New version: %s', currentEtag, head.etag)
    return {
      isUpdateAvailable: true,
      currentVersion: currentEtag,
      newVersion: head.etag,
    }
  }

  public async run() {
    if (DataSyncService.isRunning) {
      logger.warn('Data sync is already running. Skipping this run.')
      return
    }

    DataSyncService.isRunning = true

    try {
      const {
        isUpdateAvailable,
        newVersion,
      } = await this.checkForUpdates()
      const isFirstRun = !this.settings.get('gamesDbVersion')

      if (!isUpdateAvailable) {
        logger.info('No updates available. Skipping data sync.')
        return
      }

      this.emit('update', {
        event: 'start',
        type: 'checkForUpdates',
        payload: {
          isFirstRun,
          isUpdateAvailable,
        },
      } as DataSyncRendererPayload)

      const downloader = this.getDownloaderEmitterItem(isUpdateAvailable)
      const unzipper = this.getUnzipEmitterItem()
      const xmlParser = this.getXmlParserEmitterItem()
      const dbSaver = this.getSaveToDbEmitterItem()

      const chain = chainEmitters(downloader, unzipper, xmlParser, dbSaver)
      // const chain = chainEmitters(xmlParser, dbSaver)

      const emitUpdate = (event: DataSyncEventPayload) => {
        this.emit('update', {
          event: 'progress',
          type: event.type,
          payload: event.payload,
        } as DataSyncRendererPayload)
      }

      const throttled = _.throttle(emitUpdate, 1250)

      for await (const event of chain) {
        if (event.type === DataSyncType.unzip && event.event === DataSyncEventType.finish) {
          await unlink(this.downloadDestination)
        }

        if (event.event === DataSyncEventType.progress) {
          throttled(event)
        }

        if (
          event.event === DataSyncEventType.progress
          && !!event.payload
          && 'progress' in event.payload
          && event.payload.progress >= 100
        ) {
          emitUpdate(event)
        }

        if (event.event === DataSyncEventType.error) {
          throw event.payload
        }
      }

      this.settings.set('gamesDbVersion', newVersion)
      this.emit('update', {
        event: 'finish',
        type: 'checkForUpdates',
        payload: {},
      } as DataSyncRendererPayload)
      logger.info('Data sync completed successfully.')
    }
    catch (error) {
    // Handle any unhandled errors that might occur outside the chained emitters' error handling
      logger.error('Unhandled data sync error:', error)
      this.emit('update', {
        event: 'finish',
        type: 'checkForUpdates',
        payload: { error: error as Error },
      } as DataSyncRendererPayload)
    }
    finally {
      DataSyncService.isRunning = false
    }
  }
}
