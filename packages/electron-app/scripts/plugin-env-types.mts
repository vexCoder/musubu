import type { PluginBuild } from 'esbuild'
import path from 'node:path'
import fs from 'fs-extra'

interface EnvTypesPluginParameters {
  config: Record<string, string>
}

export default function EnvTypesPlugin({
  config,
}: EnvTypesPluginParameters) {
  return {
    name: 'electron',
    setup(build: PluginBuild) {
      build.onStart(() => {
        const envPath = path.join(import.meta.dirname, '..', 'src', 'env.d.ts')

        const envContent = Object.entries(config)
          .map(([key, value]) => `${key}: "${value}";`)
          .join('\n')

        const dts = `declare global { namespace NodeJS { interface ProcessEnv { ${envContent} } } } export {};`

        fs.writeFileSync(envPath, dts, 'utf8')
      })
    },
  }
}
