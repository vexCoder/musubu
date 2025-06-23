import path from 'node:path'
import antfu from '@antfu/eslint-config'
import react from 'eslint-config-shared/react.mjs'

export default antfu(
  {
    typescript: true,
    react: true,
    
    settings: {
      tailwindcss: {
        // Path to your tailwind.config.js file
        config: path.join(import.meta.dirname, 'tailwind.config.js'),
      },
    },
  },
  ...react,
)
