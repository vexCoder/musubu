import path from 'node:path'
import antfu from '@antfu/eslint-config'
import react from 'eslint-config-shared/react.mjs'

export default antfu(
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      tailwindcss: {
        // Path to your tailwind.config.js file
        config: path.join(import.meta.dirname, 'tailwind.config.js'),
      },
    },
  },
  ...react,
)
