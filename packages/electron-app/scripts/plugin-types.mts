import type { PluginBuild } from 'esbuild'
import { execa } from 'execa'

interface TypesPluginParameters {
  tsconfig: string
}

export default function TypesPlugin({
  tsconfig,
}: TypesPluginParameters) {
  return {
    name: 'electron',
    setup(build: PluginBuild) {
      build.onStart(async () => {
        console.log('Running TypeScript compiler...', tsconfig)
        try {
          const compileExec = await execa`tsc --project ${tsconfig}`
          console.log(compileExec.stdout)
          console.error(compileExec.stderr)
          console.log('TypeScript compiler finished.')

          const aliasExec = await execa`tsc-alias --project ${tsconfig}`
          console.log(aliasExec.stdout)
          console.error(aliasExec.stderr)
          console.log('TypeScript aliasing finished.')
        }
        catch (error) {
          console.error('Unexpected error:', error)
          throw new Error(`TypeScript compilation failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    },
  }
}
