import { Canvas } from '@react-three/fiber'
import { ApplyQuality } from '@overworld-engine/scene'
import { EditorPanel, EditorScene, EditorToggle } from '@overworld-engine/editor'
import { World } from './World'
import { HUD } from './ui/HUD'
import { DialogueBox } from './ui/DialogueBox'
// 引擎与事件接线(副作用模块,应用启动时装配一次)
import './game/engines'

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows camera={{ position: [0, 9, 14], fov: 50 }}>
        <color attach="background" args={['#0b0e1a']} />
        <ApplyQuality />
        <World />
        {/* 场景编辑器(未启用时不渲染任何内容) */}
        <EditorScene groundSize={40} />
      </Canvas>
      <HUD />
      <DialogueBox />
      <EditorPanel />
      <EditorToggle />
    </div>
  )
}
