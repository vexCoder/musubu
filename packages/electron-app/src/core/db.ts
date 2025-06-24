import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import SQLite from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { Paths } from '@/lib/paths'

const dialect = new SqliteDialect({
  database: new SQLite(Paths.gamesDb),
})

export const db = new Kysely<Database>({
  dialect,
})

export interface Database {
  Games: GamesTable
  Platforms: PlatformsTable
  PlatformAlternateNames: PlatformAlternateNamesTable
  GameAlternateNames: GameAlternateNamesTable
  GameImages: GameImagesTable
}

export interface GamesTable {
  DatabaseID: number
  Name: string
  Platform: string | null
  ReleaseDate: string | null
  ReleaseYear: number | null
  Overview: string | null
  MaxPlayers: number | null
  ReleaseType: string | null
  Cooperative: number | null
  VideoURL: string | null
  CommunityRating: number
  WikipediaURL: string | null
  ESRB: string | null
  CommunityRatingCount: number | null
  Genres: string | null
  Developer: string | null
  Publisher: string | null

  // internal fields
  created_at: ColumnType<Date, string | undefined, never>
}

export type Game = Selectable<GamesTable>
export type NewGame = Insertable<GamesTable>
export type GameUpdate = Updateable<GamesTable>

export interface PlatformsTable {
  Name: string
  Emulated: number
  ReleaseDate: string | null
  Developer: string | null
  Manufacturer: string | null
  Cpu: string | null
  Memory: string | null
  Graphics: string | null
  Sound: string | null
  Display: string | null
  Media: string | null
  MaxControllers: number | null
  Notes: string | null
  Category: string | null
  UseMameFiles: number

  // internal fields
  created_at: ColumnType<Date, string | undefined, never>
}

export type Platform = Selectable<PlatformsTable>
export type NewPlatform = Insertable<PlatformsTable>
export type PlatformUpdate = Updateable<PlatformsTable>

export interface PlatformAlternateNamesTable {
  Name: string
  Alternate: string

  // internal fields
  created_at: ColumnType<Date, string | undefined, never>
}

export type PlatformAlternateName = Selectable<PlatformAlternateNamesTable>
export type NewPlatformAlternateName = Insertable<PlatformAlternateNamesTable>
export type PlatformAlternateNameUpdate = Updateable<PlatformAlternateNamesTable>

export interface GameAlternateNamesTable {
  DatabaseID: number
  Alternate: string
  Region: string | null

  // internal fields
  created_at: ColumnType<Date, string | undefined, never>
}

export type GameAlternateName = Selectable<GameAlternateNamesTable>
export type NewGameAlternateName = Insertable<GameAlternateNamesTable>
export type GameAlternateNameUpdate = Updateable<GameAlternateNamesTable>

export interface GameImagesTable {
  DatabaseID: number
  FileName: string
  Type: string
  Region: string | null
  CRC32: string | null

  // internal fields
  created_at: ColumnType<Date, string | undefined, never>
}

export type GameImage = Selectable<GameImagesTable>
export type NewGameImage = Insertable<GameImagesTable>
export type GameImageUpdate = Updateable<GameImagesTable>

export async function initializeDatabase() {
  await db.schema
    .createTable('Games')
    .ifNotExists()
    .addColumn('DatabaseID', 'integer', col => col.primaryKey())
    .addColumn('Name', 'text')
    .addColumn('Platform', 'text')
    .addColumn('ReleaseDate', 'text')
    .addColumn('ReleaseYear', 'integer')
    .addColumn('Overview', 'text')
    .addColumn('MaxPlayers', 'integer')
    .addColumn('ReleaseType', 'text')
    .addColumn('Cooperative', 'integer')
    .addColumn('VideoURL', 'text')
    .addColumn('CommunityRating', 'real')
    .addColumn('WikipediaURL', 'text')
    .addColumn('ESRB', 'text')
    .addColumn('CommunityRatingCount', 'integer')
    .addColumn('Genres', 'text')
    .addColumn('Developer', 'text')
    .addColumn('Publisher', 'text')
    .addColumn('created_at', 'integer', col => col.defaultTo(new Date().getTime()))
    .execute()

  await db.schema.createIndex('idx_games_name')
    .on('Games')
    .column('Name')
    .ifNotExists()
    .execute()

  await db.schema.createIndex('idx_games_platform')
    .on('Games')
    .column('Platform')
    .ifNotExists()
    .execute()

  await db.schema
    .createTable('Platforms')
    .ifNotExists()
    .addColumn('Name', 'text', col => col.primaryKey())
    .addColumn('Emulated', 'integer')
    .addColumn('ReleaseDate', 'text')
    .addColumn('Developer', 'text')
    .addColumn('Manufacturer', 'text')
    .addColumn('Cpu', 'text')
    .addColumn('Memory', 'text')
    .addColumn('Graphics', 'text')
    .addColumn('Sound', 'text')
    .addColumn('Display', 'text')
    .addColumn('Media', 'text')
    .addColumn('MaxControllers', 'integer')
    .addColumn('Notes', 'text')
    .addColumn('Category', 'text')
    .addColumn('UseMameFiles', 'integer')
    .addColumn('created_at', 'integer', col => col.defaultTo(new Date().getTime()))
    .execute()

  await db.schema
    .createTable('PlatformAlternateNames')
    .ifNotExists()
    .addColumn('Name', 'text', col => col.references('Platforms.Name'))
    .addColumn('Alternate', 'text')
    .addColumn('created_at', 'integer', col => col.defaultTo(new Date().getTime()))
    .addPrimaryKeyConstraint('pk_platform_alternate_names', ['Name', 'Alternate'])
    .execute()

  await db.schema
    .createTable('GameAlternateNames')
    .ifNotExists()
    .addColumn('DatabaseID', 'integer', col => col.references('Games.DatabaseID'))
    .addColumn('Alternate', 'text')
    .addColumn('Region', 'text')
    .addColumn('created_at', 'integer', col => col.defaultTo(new Date().getTime()))
    .addPrimaryKeyConstraint('pk_game_alternate_names', ['DatabaseID', 'Alternate'])
    .execute()

  await db.schema
    .createTable('GameImages')
    .ifNotExists()
    .addColumn('DatabaseID', 'integer', col => col.references('Games.DatabaseID'))
    .addColumn('FileName', 'text')
    .addColumn('Type', 'text')
    .addColumn('Region', 'text')
    .addColumn('CRC32', 'text')
    .addColumn('created_at', 'integer', col => col.defaultTo(new Date().getTime()))
    .addPrimaryKeyConstraint('pk_game_images', ['DatabaseID', 'FileName'])
    .execute()
}
