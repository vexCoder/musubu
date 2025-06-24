import fs from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import esbuild from 'esbuild'
import _ from 'lodash'
import { parseEnv } from './config.mjs'
import pluginElectron from './plugin-electron.mjs'
import pluginEnvTypes from './plugin-env-types.mjs'
import pluginTypes from './plugin-types.mjs'
import { cli } from './utils.mjs'

const parameters = [
  { name: 'dev' as const, type: Boolean },
  { name: 'prod' as const, type: Boolean },
]

async function build() {
  const options = cli(parameters)
  const config = parseEnv({
    ...options.dev && { NODE_ENV: 'development' },
    ...options.prod && { NODE_ENV: 'production' },
  })

  let define = {}

  try {
    type Env = typeof config
    type MappedEnv = Record<`process.env.${keyof Env}`, `"${Env[keyof Env]}"`>

    const envKeys = _.keys(config) as (keyof Env)[]

    define = _.reduce(envKeys, (acc: MappedEnv, key: keyof Env) => {
      acc[`process.env.${key}`] = `"${config[key]}"`
      return acc
    }, {} as MappedEnv)
  }
  catch (error) {
    console.error(error)
    define = {}
  }

  let plugins: {
    name: string
    setup: (build: esbuild.PluginBuild) => void
  }[] = []

  if (options.dev) {
    plugins = [
      pluginElectron({
        pathToMain: resolve(import.meta.dirname, '..', 'dist', 'index.js'),
        enableSourceMaps: true,
      }),
      pluginTypes({
        tsconfig: resolve(import.meta.dirname, '..', 'tsconfig.types.json'),
      }),
      pluginEnvTypes({
        config,
      }),
    ]
  }

  const ctx = {
    main: await esbuild.context({
      entryPoints: ['src/index.ts'],
      outdir: 'dist',
      outbase: 'src',
      bundle: true,
      platform: 'node',
      sourcemap: true,

      external: [
        '@musubu/tracker',
        'electron',
        'better-sqlite3',
        ...builtinModules,
      ],

      define,

      plugins,
    }),
    bridge: await esbuild.context({
      entryPoints: ['src/bridge.ts'],
      outdir: 'dist',
      outbase: 'src',
      bundle: true,
      format: 'cjs',
      platform: 'node',
      external: ['electron', 'better-sqlite3', ...builtinModules],
      define,
    }),
  }

  if (options.dev) {
    await Promise.all([
      ctx.main.watch(),
      ctx.bridge.watch(),
    ])
  }

  if (options.prod) {
    const pathToDist = resolve(import.meta.dirname, '..', 'dist')

    let exists = false
    try {
      const stat = await fs.stat(pathToDist)
      exists = stat.isDirectory()
    }
    catch (error) {
      console.error(error)
    }

    if (exists) {
      await fs.rm(pathToDist, { recursive: true })
    }

    await Promise.all([
      ctx.main.rebuild(),
      ctx.bridge.rebuild(),
    ])

    process.exit(0)
  }
}

build()
