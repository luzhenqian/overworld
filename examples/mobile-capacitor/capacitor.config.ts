import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.overworld.mobile',
  appName: 'Overworld',
  webDir: 'dist',
  ios: {
    // 配合 viewport-fit=cover:内容自绘安全区,不要 WebView 自动缩进
    contentInset: 'never',
  },
  android: {
    // 存档走 bridge.storage()(localStorage),开启持久化 WebView 存储
    allowMixedContent: false,
  },
}

export default config
