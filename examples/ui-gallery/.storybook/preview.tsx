import React from 'react'
import type { Decorator, Preview } from '@storybook/react-vite'
import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/xianxia.css'
import '@overworld-engine/ui/themes/hextech.css'
import '@overworld-engine/ui/themes/tactical.css'
import '@overworld-engine/ui/themes/pixel.css'
import { THEMES, ThemeContext, type ThemeName } from './theme'

const withOverworldTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme ?? 'base') as ThemeName
  return (
    <ThemeContext.Provider value={theme}>
      <div
        className="ow-root"
        data-ow-theme={theme === 'base' ? undefined : theme}
        style={{
          minHeight: '100vh',
          background:
            'radial-gradient(1200px 600px at 30% -10%, #2a3040 0%, #202430 55%, #181c26 100%)',
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        <Story />
      </div>
    </ThemeContext.Provider>
  )
}

const preview: Preview = {
  decorators: [withOverworldTheme],
  globalTypes: {
    theme: {
      description: 'Overworld theme skin',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [...THEMES],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'base',
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    options: {
      storySort: {
        order: ['Primitives', 'Engines', 'Integrated'],
      },
    },
  },
}

export default preview
