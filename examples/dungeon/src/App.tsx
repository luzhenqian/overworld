import { Canvas } from '@react-three/fiber'
import { ApplyQuality } from '@overworld-engine/scene'
import { EditorPanel, EditorScene, EditorToggle } from '@overworld-engine/editor'
import { World } from './World'
import { HUD } from './ui/HUD'
import { DialogueBox } from './ui/DialogueBox'
import { DevInspector } from './ui/DevInspector'
// 引擎与事件接线(副作用模块,应用启动时装配一次)
import './game/engines'

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows camera={{ position: [0, 9, 7], fov: 50 }}>
        <color attach="background" args={['#05060d']} />
        <ApplyQuality />
        <World />
        {/* 场景编辑器(未启用时不渲染任何内容) */}
        <EditorScene groundSize={48} />
      </Canvas>
      <HUD />
      <DialogueBox />
      <EditorPanel />
      <EditorToggle />
      {/* 开发调试:按 ` 切换事件总线检查器(默认隐藏) */}
      <DevInspector />
    </div>
  )
}
