import { createContext } from 'react'

export const THEMES = ['base', 'xianxia', 'hextech', 'tactical', 'pixel'] as const
export type ThemeName = (typeof THEMES)[number]

/** Stories that render their own `<Hud>` read this to re-apply the active theme. */
export const ThemeContext = createContext<ThemeName>('base')
