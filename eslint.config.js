import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Il pattern "fetch al mount + subscription realtime dentro useEffect"
      // è usato deliberatamente in tutto il progetto (Home, EventDetail,
      // CalendarView, EventComments): la regola lo segnala come errore,
      // ma eliminarlo richiederebbe di riscrivere l'architettura di data
      // fetching. La teniamo come warning invece che error per non
      // bloccare la CI su un pattern esistente e voluto.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
