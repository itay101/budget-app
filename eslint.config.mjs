import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...nextCoreWebVitals,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // eslint-plugin-react-hooks v7 (bundled with eslint-config-next 16) turns on
      // the former React Compiler rule set as errors by default. Several
      // pre-existing patterns in this codebase trip these; downgrade to warnings
      // so the version bump doesn't block CI on an unrelated behavioral refactor.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]
