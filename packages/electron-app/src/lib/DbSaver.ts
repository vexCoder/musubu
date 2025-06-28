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
    ReleaseYear: data.ReleaseYear ? Number.parseInt(data.ReleaseYear, 10) : null,
    Overview: data.Overview || null,
    MaxPlayers: data.MaxPlayers ? Number.parseInt(data.MaxPlayers, 10) : null,
    ReleaseType: data.ReleaseType || null,
    Cooperative: data.Cooperative === 'true' ? 1 : 0,
    VideoURL: data.VideoURL || null,
    CommunityRating: Number.parseFloat(data.CommunityRating) || 0,
    WikipediaURL: data.WikipediaURL || null,
    ESRB: data.ESRB || null,
    CommunityRatingCount: data.CommunityRatingCount ? Number.parseInt(data.CommunityRatingCount, 10) : null,
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
    Emulated: data.Emulated === 'true' ? 1 : 0,
    ReleaseDate: data.ReleaseDate || null,
    Developer: data.Developer || null,
    Manufacturer: data.Manufacturer || null,
    Cpu: data.Cpu || null,
    Memory: data.Memory || null,
    Graphics: data.Graphics || null,
    Sound: data.Sound || null,
    Display: data.Display || null,
    Media: data.Media || null,
    MaxControllers: data.MaxControllers ? Number.parseInt(data.MaxControllers, 10) : null,
    Notes: data.Notes || null,
    Category: data.Category || null,
    UseMameFiles: data.UseMameFiles === 'true' ? 1 : 0,
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
  progress: [{ savedCount: number, totalPending: number, progress: number }]
  finish: []
  error: [Error]
}

export class DbSaver extends EventEmitter<DbSaverEventMap> {
  private dbWriteQueue: PQueue
  // eslint-disable-next-line ts/no-explicit-any
  private dataMap: Map<string, any[]> = new Map()
  private dbInstance: typeof db = db
  private isSaving: boolean = false
  private totalProcessingTask: number = 0

  constructor() {
    super()
    this.dbWriteQueue = new PQueue({ concurrency: 1 }) // Limit concurrent DB writes

    const debouncedCheck = _.debounce(() => {
      if (!this.dbWriteQueue.size && !this.getTotalPendingData()) {
        this.isSaving = false
        this.emit('finish')
        console.log('[DbSaver] All data saved successfully.')
      }
    }, 500)

    this.dbWriteQueue.on('completed', () => {
      console.log(`[DbSaver] Active writes: ${this.dbWriteQueue.size} (Pending: ${this.dbWriteQueue.pending})`)
      this.emit('progress', {
        savedCount: this.dbWriteQueue.size,
        totalPending: this.dbWriteQueue.pending,
        progress: ((this.totalProcessingTask - this.dbWriteQueue.size) / this.totalProcessingTask) * 100,
      })

      debouncedCheck()
    })
  }

  private getTotalPendingData(): number {
    let total = 0
    for (const list of this.dataMap.values()) {
      total += list.length
    }
    return total
  }

  public async startSaving(): Promise<void> {
    if (this.isSaving) {
      console.warn('[DbSaver] Saving process is already running.')
      return // Prevent multiple concurrent saves
    }

    this.isSaving = true
    this.emit('progress', { savedCount: 0, totalPending: this.getTotalPendingData(), progress: 0 })

    try {
      while (true) {
        let processedBatchCount = 0 // Number of items processed in this loop iteration

        const currentKeys = Array.from(this.dataMap.keys())
        if (currentKeys.length === 0 && this.dbWriteQueue.size === 0 && this.dbWriteQueue.pending === 0) {
          break // No more data to process and no pending writes
        }

        for (const key of currentKeys) {
          const list = this.dataMap.get(key)
          if (!list || list.length === 0) {
            this.dataMap.delete(key)
            continue
          }

          const batch = list.splice(0, 1000) // Take a batch
          processedBatchCount += batch.length

          this.totalProcessingTask += 1
          // Enqueue the database operation, ensuring concurrency limits are respected
          this.dbWriteQueue.add(async () => {
            try {
              // console.log(`[DbSaver] saving ${batch.length} items for ${key}`); // Log moved to main sync service
              if (key === 'Game') {
                await this.dbInstance.insertInto('Games').values(batch.map(mapXmlGameToNewGame)).onConflict(oc => oc.column('DatabaseID').doUpdateSet(eb => ({
                  Name: eb.ref('Games.Name'),
                  Platform: eb.ref('Games.Platform'),
                  ReleaseDate: eb.ref('Games.ReleaseDate'),
                  ReleaseYear: eb.ref('Games.ReleaseYear'),
                  Overview: eb.ref('Games.Overview'),
                  MaxPlayers: eb.ref('Games.MaxPlayers'),
                  ReleaseType: eb.ref('Games.ReleaseType'),
                  Cooperative: eb.ref('Games.Cooperative'),
                  VideoURL: eb.ref('Games.VideoURL'),
                  CommunityRating: eb.ref('Games.CommunityRating'),
                  WikipediaURL: eb.ref('Games.WikipediaURL'),
                  ESRB: eb.ref('Games.ESRB'),
                  CommunityRatingCount: eb.ref('Games.CommunityRatingCount'),
                  Genres: eb.ref('Games.Genres'),
                  Developer: eb.ref('Games.Developer'),
                  Publisher: eb.ref('Games.Publisher'),
                }))).execute()
              }
              else if (key === 'Platform') {
                await this.dbInstance.insertInto('Platforms').values(batch.map(mapXmlPlatformToNewPlatform)).onConflict(oc => oc.column('Name').doUpdateSet(eb => ({
                  Emulated: eb.ref('Platforms.Emulated'),
                  ReleaseDate: eb.ref('Platforms.ReleaseDate'),
                  Developer: eb.ref('Platforms.Developer'),
                  Manufacturer: eb.ref('Platforms.Manufacturer'),
                  Cpu: eb.ref('Platforms.Cpu'),
                  Memory: eb.ref('Platforms.Memory'),
                  Graphics: eb.ref('Platforms.Graphics'),
                  Sound: eb.ref('Platforms.Sound'),
                  Display: eb.ref('Platforms.Display'),
                  Media: eb.ref('Platforms.Media'),
                  MaxControllers: eb.ref('Platforms.MaxControllers'),
                  Notes: eb.ref('Platforms.Notes'),
                  Category: eb.ref('Platforms.Category'),
                  UseMameFiles: eb.ref('Platforms.UseMameFiles'),
                }))).execute()
              }
              else if (key === 'PlatformAlternateName') {
                await this.dbInstance.insertInto('PlatformAlternateNames').values(batch.map(mapXmlPlatformAlternateNameToNewPlatformAlternateName)).onConflict(oc => oc.columns(['Name', 'Alternate']).doUpdateSet(eb => ({
                  Name: eb.ref('PlatformAlternateNames.Name'),
                  Alternate: eb.ref('PlatformAlternateNames.Alternate'),
                }))).execute()
              }
              else if (key === 'GameAlternateName') {
                await this.dbInstance.insertInto('GameAlternateNames').values(batch.map(mapXmlGameAlternateNameToNewGameAlternateName)).onConflict(oc => oc.columns(['DatabaseID', 'Alternate']).doUpdateSet(eb => ({
                  Alternate: eb.ref('GameAlternateNames.Alternate'),
                  Region: eb.ref('GameAlternateNames.Region'),
                }))).execute()
              }
              else if (key === 'GameImage') {
                await this.dbInstance.insertInto('GameImages').values(batch.map(mapXmlGameImageToNewGameImage)).onConflict(oc => oc.columns(['DatabaseID', 'FileName']).doUpdateSet(eb => ({
                  FileName: eb.ref('GameImages.FileName'),
                  Type: eb.ref('GameImages.Type'),
                  Region: eb.ref('GameImages.Region'),
                  CRC32: eb.ref('GameImages.CRC32'),
                }))).execute()
              }
            }
            catch (error) {
              console.error(`Error saving batch for ${key}:`, error)
            }

            return batch.length // Return the number of items processed
          })
        }

        if (!processedBatchCount && !this.dbWriteQueue.pending && !this.getTotalPendingData()) {
          await this.dbWriteQueue.onIdle()
          if (this.getTotalPendingData() === 0) {
            break
          }
        }

        if (!processedBatchCount) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
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
  }
}
