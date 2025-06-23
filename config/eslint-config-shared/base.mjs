export default [
  {
    ignores: [
      '**/dist/**',
      '**/dist_ts/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/eslint.config.js',
      '**/eslint.config.mjs',
      '**/package.json',
      '**/tsconfig.json',
      '**/tsconfig.types.json',
      '**/vite.config.ts',
      '**/vite.config.mts',
    ]
  },
  {
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'class-methods-use-this': 'off',
      'import/prefer-default-export': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'node/prefer-global/process': 'off',
    },
  },
]