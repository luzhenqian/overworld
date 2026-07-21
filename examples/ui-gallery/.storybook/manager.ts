import { addons } from 'storybook/manager-api'
import { create } from 'storybook/theming'

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Overworld UI',
    brandUrl: 'https://github.com/luzhenqian/overworld',
    colorPrimary: '#6c9bd2',
    colorSecondary: '#c9a227',
    appBg: '#12151d',
    appContentBg: '#181c26',
    appBorderColor: '#2a3040',
    appBorderRadius: 8,
    textColor: '#e8eaf0',
    textInverseColor: '#12151d',
    barBg: '#12151d',
    barTextColor: '#9aa0b0',
    barSelectedColor: '#c9a227',
    barHoverColor: '#e8eaf0',
    inputBg: '#202430',
    inputBorder: '#2a3040',
    inputTextColor: '#e8eaf0',
  }),
})
