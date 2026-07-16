import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // pnpm workspace 下 @overworld-engine/scene 的 peer 依赖可能解析到
    // 另一份 fiber/three 实例(R3F context 不同实例互不相认),强制去重。
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
  },
})
