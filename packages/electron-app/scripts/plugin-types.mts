import type { PluginBuild } from 'esbuild'
import { execa, execaCommand } from 'execa'

interface TypesPluginParameters {
  tsconfig: string
}

export default function TypesPlugin({
  tsconfig,
}: TypesPluginParameters) {
  return {
    name: 'electron',
    setup(build: PluginBuild) {
      build.onEnd(async () => {
        console.log('Running TypeScript compiler...', tsconfig)
        const { stdout, stderr } = await execa`tsc --project ${tsconfig}`
          .pipe`tsc-alias -p ${tsconfig}`
        console.log(stdout)
        console.error(stderr)
        console.log('TypeScript compiler finished.')
      })
    },
  }
}
