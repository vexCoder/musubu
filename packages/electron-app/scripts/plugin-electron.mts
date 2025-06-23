import type { PluginBuild } from 'esbuild'
import type { ResultPromise } from 'execa'
import { execa } from 'execa'
import { pathExists } from 'fs-extra'
import kill from 'tree-kill'

interface ElectronPluginParameters {
  enableSourceMaps?: boolean
  pathToMain: string
}

export default function ElectronPlugin({
  pathToMain,
  enableSourceMaps,
}: ElectronPluginParameters) {
  return {
    name: 'electron',
    setup(build: PluginBuild) {
      let electronProc: ResultPromise | null = null

      build.onStart(() => {
        if (electronProc?.pid) {
          console.log(`Killing electron`)
          kill(electronProc?.pid, 'SIGKILL')
        }
      })

      build.onEnd(async (result) => {
        if (!result.errors.length) {
          console.log(`Starting electron`)
          const args: string[] = []

          if (enableSourceMaps) {
            args.push('--enable-source-maps')
          }

          if (await pathExists(pathToMain)) {
            args.push(pathToMain)
          }
          else {
            throw new Error(`Main file not found at ${pathToMain}`)
          }

          electronProc = execa(`electron`, args, {
            stdio: 'inherit',
            reject: false,
          })
        }
      })
    },
  }
}
