import { createContext, useEffect, useState } from 'react'
import type { GlobalProvider } from '@ladle/react'
import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/xianxia.css'
import '@overworld-engine/ui/themes/hextech.css'
import '@overworld-engine/ui/themes/tactical.css'
import '@overworld-engine/ui/themes/pixel.css'

export const THEMES = ['base', 'xianxia', 'hextech', 'tactical', 'pixel'] as const
// NOT exported: @ladle/react's components.tsx AST scan (checkIfNamedExportExists in
// get-components-import.js, present through at least v3.3.1–v5.1.1) unconditionally reads
// `declaration.declarations[0]` on every ExportNamedDeclaration, which throws on a
// TSTypeAliasDeclaration (no `.declarations`) and crashes story discovery. Nothing in this
// package imports the type, so keeping it internal avoids the crash without losing anything.
type ThemeName = (typeof THEMES)[number]

/** Stories that render their own `<Hud>` read this to re-apply the theme. */
export const ThemeContext = createContext<ThemeName>('base')

export const Provider: GlobalProvider = ({ children }) => {
  const [theme, setTheme] = useState<ThemeName>(
    () => (localStorage.getItem('ow-gallery-theme') as ThemeName) ?? 'base',
  )
  useEffect(() => {
    localStorage.setItem('ow-gallery-theme', theme)
  }, [theme])
  return (
    <ThemeContext.Provider value={theme}>
      <div
        className="ow-root"
        data-ow-theme={theme === 'base' ? undefined : theme}
        style={{ minHeight: '100vh', background: '#202430', padding: 16 }}
      >
        <div style={{ marginBottom: 16 }}>
          <label>
            Theme{' '}
            <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
              {THEMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
