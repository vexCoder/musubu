import base from './base.mjs';
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tailwind from '@hyoban/eslint-plugin-tailwindcss'

export default [
  base,
  ...tailwind.configs['flat/recommended'],
  jsxA11y.flatConfigs.recommended,
  {
    rules: {
      'react/prefer-destructuring-assignment': 'off',
      'tailwindcss/no-custom-classname': 'off',
    },
  }
]
