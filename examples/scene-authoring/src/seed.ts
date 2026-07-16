import type { SceneConfigInput } from '@overworld-engine/editor'

/**
 * 初始场景:2 个 NPC + 1 座建筑。全部使用空 `modelPath`(回退为胶囊体 / 盒体),
 * 因此无需任何美术资源即可跑通「编辑 → 导出 → 校验 → 渲染」全链路。
 *
 * 坐标刻意远离原点:渲染画布未挂载 `<Player>`,`playerPositionRef` 停在
 * `[0,0,0]`,把实体放在各自邻近半径之外可避免触发名牌(troika 文本)。
 */
export const SEED_SCENE: SceneConfigInput = {
  npcs: [
    { id: 'guide', modelPath: '', position: [5, 0, 3], rotation: [0, Math.PI, 0], name: '向导' },
    { id: 'merchant', modelPath: '', position: [-6, 0, 4], rotation: [0, 0, 0], name: '商人' },
  ],
  buildings: [
    {
      id: 'bank',
      name: '银行',
      modelPath: '',
      position: [0, 0, -12],
      rotation: [0, 0, 0],
      scale: 2,
      collisionRadius: 5,
    },
  ],
}
