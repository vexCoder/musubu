import antfu from '@antfu/eslint-config'
import electron from 'eslint-config-shared/electron.mjs'

export default antfu(
  {
    typescript: true,
    jsonc: true,
    yaml: true,
    markdown: true,
    gitignore: true,

    stylistic: {
      indent: 2
    },
  },
  ...electron
)
