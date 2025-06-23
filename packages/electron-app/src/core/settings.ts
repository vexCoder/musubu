import type { Low } from 'lowdb'
import { Paths } from '@lib/paths'
import { JSONFilePreset } from 'lowdb/node'

interface SettingsSchema {
  window?: {
    width: number
    height: number
  }
}

export type SettingsDb = Low<SettingsSchema>

export class Settings {
  static db: SettingsDb | null = null

  static get<T extends keyof SettingsSchema>(key: T): SettingsSchema[T] | undefined {
    return this.db?.data[key]
  }

  static set<T extends keyof SettingsSchema>(key: T, value: SettingsSchema[T]) {
    if (!this.db) {
      throw new Error('Settings database is not initialized')
    }
    this.db.data[key] = value
    return this.db.write()
  }

  public static async load() {
    this.db = await JSONFilePreset<SettingsSchema>(Paths.settings, {})
  }
}
