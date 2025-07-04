import type { NewGame, NewGameAlternateName, NewGameImage, NewPlatform, NewPlatformAlternateName } from '@/core/db'
import EventEmitter from 'node:events'
import _ from 'lodash'
import PQueue from 'p-queue'
import { db } from '@/core/db'

// eslint-disable-next-line ts/no-explicit-any
function mapXmlGameToNewGame(data: any): NewGame {
  return {
    Name: data.Name,
    Platform: data.Platform || null,
    ReleaseDate: data.ReleaseDate || null,
    ReleaseYear: data.ReleaseYear,
    Overview: data.Overview || null,
    MaxPlayers: data.MaxPlayers,
    ReleaseType: data.ReleaseType || null,
    Cooperative: data.Cooperative ? 1 : 0,
    VideoURL: data.VideoURL || null,
    CommunityRating: data.CommunityRating,
    WikipediaURL: data.WikipediaURL || null,
    ESRB: data.ESRB || null,
    CommunityRatingCount: data.CommunityRatingCount,
    Genres: data.Genres || null,
    Developer: data.Developer || null,
    Publisher: data.Publisher || null,
    DatabaseID: data.DatabaseID,
  }
}

// eslint-disable-next-line ts/no-explicit-any
function mapXmlPlatformToNewPlatform(data: any): NewPlatform {
  return {
    Name: data.Name,
    Emulated: data.Emulated ? 1 : 0,
    ReleaseDate: data.ReleaseDate || null,
    Developer: data.Developer || null,
    Manufacturer: data.Manufacturer || null,
    Cpu: data.Cpu || null,
    Memory: data.Memory || null,
    Graphics: data.Graphics || null,
    Sound: data.Sound || null,
    Display: data.Display || null,
    Media: data.Media || null,
    MaxControllers: data.MaxControllers,
    Notes: data.Notes || null,
    Category: data.Category || null,
    UseMameFiles: data.UseMameFiles ? 1 : 0,
  }
}

// eslint-disable-next-line ts/no-explicit-any
function mapXmlPlatformAlternateNameToNewPlatformAlternateName(data: any): NewPlatformAlternateName {
  return {
    Alternate: data.Alternate,
    Name: data.Name,
  }
}

// eslint-disable-next-line ts/no-explicit-any
function mapXmlGameAlternateNameToNewGameAlternateName(data: any): NewGameAlternateName {
  return {
    Alternate: data.AlternateName,
    DatabaseID: data.DatabaseID,
    Region: data.Region || null,
  }
}

// eslint-disable-next-line ts/no-explicit-any
function mapXmlGameImageToNewGameImage(data: any): NewGameImage {
  return {
    DatabaseID: data.DatabaseID,
    FileName: data.FileName,
    Type: data.Type,
    Region: data.Region || null,
    CRC32: data.CRC32 || null,
  }
}

// --- New: DbSaver Class for emitting DB events ---
interface DbSaverEventMap {
  progress: [{ savedCount: number, totalPending: number, progress: number, type: 'Save' | 'Append' }]
  finish: []
  error: [Error]
}

export class DbSaver extends EventEmitter<DbSaverEventMap> {
  private dbWriteQueue: PQueue
  // eslint-disable-next-line ts/no-explicit-any
  private dataMap: Map<string, any[]> = new Map()
  private dbInstance: typeof db = db
  private isAppend: boolean = false
  private isSaving: boolean = false
  private pendingStartCount: number = 0
  private totalProcessingTask: number = 0
  private processedItemCount: number = 0

  constructor() {
    super()
    this.dbWriteQueue = new PQueue({ concurrency: 1 })

    this.dbWriteQueue.pause()

    const debouncedCheck = _.debounce(() => {
      if (!this.dbWriteQueue.size && !this.getTotalPendingData()) {
        this.isSaving = false
        this.emit('finish')
        console.log('[DbSaver] All data saved successfully.')
      }
    }, 500)

    this.dbWriteQueue.on('completed', (result) => {
      this.processedItemCount += result
      console.log(`[DbSaver] Completed a batch of ${result} items. Items left to process: ${this.totalProcessingTask - this.processedItemCount}`)
      this.emit('progress', {
        savedCount: this.processedItemCount,
        totalPending: this.totalProcessingTask - this.processedItemCount,
        progress: (this.processedItemCount / this.totalProcessingTask) * 100,
        type: 'Save',
      })

      debouncedCheck()
    })

    this.dbWriteQueue.on('error', (error) => {
      this.isSaving = false
      this.emit('error', error)
      console.error('[DbSaver] Error occurred while processing the queue:', error)
      this.dbWriteQueue.clear()
      this.dbWriteQueue.pause()
      this.dataMap.clear()
    })
  }

  private getTotalPendingData(): number {
    let total = 0
    for (const list of this.dataMap.values()) {
      total += list.length
    }
    return total
  }

  public resumeQueue() {
    if (this.isAppend) {
      this.isSaving = true
    }
  }

  public async startAppend(): Promise<void> {
    if (this.isSaving) {
      console.warn('[DbSaver] Cannot start appending data while already saving. Please wait for the current operation to finish.')
      return
    }

    if (this.isAppend) {
      console.warn('[DbSaver] Already in append mode. No need to start again.')
      return
    }

    this.isAppend = true

    try {
      while (true) {
        const currentKeys = Array.from(this.dataMap.keys())

        for (const key of currentKeys) {
          const list = this.dataMap.get(key)
          if (!list?.length) {
            this.dataMap.delete(key)
            continue
          }

          const batch = list.splice(0, 1000)
          this.totalProcessingTask += batch.length
          console.log(`[DbSaver] Processing ${batch.length} items for ${key}.`)
          this.dbWriteQueue.add(async () => {
            if (key === 'Game') {
              await this.dbInstance.insertInto('Games').values(batch.map(mapXmlGameToNewGame)).onConflict(oc => oc.column('DatabaseID').doUpdateSet(eb => ({
                Name: eb.ref('excluded.Name'),
                Platform: eb.ref('excluded.Platform'),
                ReleaseDate: eb.ref('excluded.ReleaseDate'),
                ReleaseYear: eb.ref('excluded.ReleaseYear'),
                Overview: eb.ref('excluded.Overview'),
                MaxPlayers: eb.ref('excluded.MaxPlayers'),
                ReleaseType: eb.ref('excluded.ReleaseType'),
                Cooperative: eb.ref('excluded.Cooperative'),
                VideoURL: eb.ref('excluded.VideoURL'),
                CommunityRating: eb.ref('excluded.CommunityRating'),
                WikipediaURL: eb.ref('excluded.WikipediaURL'),
                ESRB: eb.ref('excluded.ESRB'),
                CommunityRatingCount: eb.ref('excluded.CommunityRatingCount'),
                Genres: eb.ref('excluded.Genres'),
                Developer: eb.ref('excluded.Developer'),
                Publisher: eb.ref('excluded.Publisher'),
              }))).execute()
            }
            else if (key === 'Platform') {
              await this.dbInstance.insertInto('Platforms').values(batch.map(mapXmlPlatformToNewPlatform)).onConflict(oc => oc.column('Name').doUpdateSet(eb => ({
                Emulated: eb.ref('excluded.Emulated'),
                ReleaseDate: eb.ref('excluded.ReleaseDate'),
                Developer: eb.ref('excluded.Developer'),
                Manufacturer: eb.ref('excluded.Manufacturer'),
                Cpu: eb.ref('excluded.Cpu'),
                Memory: eb.ref('excluded.Memory'),
                Graphics: eb.ref('excluded.Graphics'),
                Sound: eb.ref('excluded.Sound'),
                Display: eb.ref('excluded.Display'),
                Media: eb.ref('excluded.Media'),
                MaxControllers: eb.ref('excluded.MaxControllers'),
                Notes: eb.ref('excluded.Notes'),
                Category: eb.ref('excluded.Category'),
                UseMameFiles: eb.ref('excluded.UseMameFiles'),
              }))).execute()
            }
            else if (key === 'PlatformAlternateName') {
              await this.dbInstance.insertInto('PlatformAlternateNames').values(batch.map(mapXmlPlatformAlternateNameToNewPlatformAlternateName)).onConflict(oc => oc.columns(['Name', 'Alternate']).doUpdateSet(eb => ({
                Name: eb.ref('excluded.Name'),
                Alternate: eb.ref('excluded.Alternate'),
              }))).execute()
            }
            else if (key === 'GameAlternateName') {
              await this.dbInstance.insertInto('GameAlternateNames').values(batch.map(mapXmlGameAlternateNameToNewGameAlternateName)).onConflict(oc => oc.columns(['DatabaseID', 'Alternate']).doUpdateSet(eb => ({
                Alternate: eb.ref('excluded.Alternate'),
                Region: eb.ref('excluded.Region'),
              }))).execute()
            }
            else if (key === 'GameImage') {
              await this.dbInstance.insertInto('GameImages').values(batch.map(mapXmlGameImageToNewGameImage)).onConflict(oc => oc.columns(['DatabaseID', 'FileName']).doUpdateSet(eb => ({
                FileName: eb.ref('excluded.FileName'),
                Type: eb.ref('excluded.Type'),
                Region: eb.ref('excluded.Region'),
                CRC32: eb.ref('excluded.CRC32'),
              }))).execute()
            }

            return batch.length
          })
        }

        if (this.isSaving && !this.pendingStartCount) {
          this.pendingStartCount = this.getTotalPendingData()
          console.log(`[DbSaver] Starting append mode with ${this.pendingStartCount} items pending.`)
        }

        if (this.isSaving && this.getTotalPendingData() > 0) {
          this.emit('progress', {
            savedCount: 0,
            totalPending: 0,
            progress: (this.pendingStartCount - this.getTotalPendingData()) / this.pendingStartCount * 100,
            type: 'Append',
          })
        }

        // if (!this.getTotalPendingData() && this.isSaving) {
        if (this.isSaving && !this.getTotalPendingData()) {
          this.isAppend = false
          this.dbWriteQueue.start()
          console.log('[DbSaver] No more data to process. Stopping append mode.')
          break
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      }
      await this.dbWriteQueue.onIdle()
    }
    catch (error) {
      this.emit('error', error as Error)
      this.dbWriteQueue.clear()
    }
    finally {
      this.dataMap.clear()
    }
  }

  // eslint-disable-next-line ts/no-explicit-any
  public addData(type: string, data: any): void {
    if (!this.dataMap.has(type)) {
      this.dataMap.set(type, [])
    }
    this.dataMap.get(type)?.push(data)

    if (!this.isAppend) {
      this.startAppend()
    }
  }
}
