'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { GameStage } from './game-stage';

export type SceneId = 'meadow' | 'dungeon' | 'town' | 'stealth' | 'defense' | 'coop';

type Scene = {
  id: SceneId;
  index: string;
  code: string;
  title: string;
  genre: string;
  duration: string;
  objective: string;
  description: string;
  packages: readonly string[];
  variants: readonly string[];
};

const SCENES: readonly Scene[] = [
  {
    id: 'meadow',
    index: '01',
    code: 'DAWN MEADOW',
    title: '晨雾原野',
    genre: '第三人称探索',
    duration: '约 60 秒',
    objective: '收集三枚星辉结晶，打开北境传送门。',
    description:
      '穿过树林和村落寻找散落的结晶。天气与光照持续变化，但真正的目标只有一个：探索、收集、离开。',
    packages: ['scene', 'environment', 'minimap', 'inventory'],
    variants: ['清晨', '骤雨', '黄昏'],
  },
  {
    id: 'dungeon',
    index: '02',
    code: 'FORGOTTEN RUINS',
    title: '遗忘地牢',
    genre: '地牢解谜',
    duration: '约 90 秒',
    objective: '找到钥匙、启动机关，穿过石门取得遗物。',
    description:
      '一条完整的小型解谜链：钥匙改变可用交互，机关改变场景碰撞，最终宝箱完成目标。',
    packages: ['scene', 'quest', 'inventory', 'notifications'],
    variants: ['探索', '标准', '挑战'],
  },
  {
    id: 'town',
    index: '03',
    code: 'BORDER TOWN',
    title: '边境小镇',
    genre: '叙事 RPG',
    duration: '约 2 分钟',
    objective: '接受委托、领取包裹，并把它交还给镇长。',
    description:
      '居民沿自己的路线生活。你可以与镇长和商人交谈，完成一次有前置条件、物品流转和对话反馈的委托。',
    packages: ['dialogue', 'quest', 'inventory', 'ai'],
    variants: ['早市', '午后', '灯会'],
  },
  {
    id: 'stealth',
    index: '04',
    code: 'NIGHT INFILTRATION',
    title: '午夜潜入',
    genre: '潜行',
    duration: '约 90 秒',
    objective: '避开巡逻守卫，取得密令并抵达撤离点。',
    description:
      '守卫拥有可见的视野和巡逻路线。利用石柱遮挡视线，触发声响诱饵，再寻找穿过庭院的安全窗口。',
    packages: ['ai', 'scene', 'audio', 'tutorial'],
    variants: ['新手', '标准', '警戒'],
  },
  {
    id: 'defense',
    index: '05',
    code: 'RIFT DEFENSE',
    title: '裂隙守卫',
    genre: '动作防守',
    duration: '约 60 秒',
    objective: '移动、射击并阻止十二只虚空生物抵达核心。',
    description:
      '敌人从多个入口逼近。玩家需要调整站位、选择目标并保护中央核心，完成一轮短小但完整的战斗循环。',
    packages: ['input', 'audio', 'notifications', 'achievements'],
    variants: ['练习', '标准', '硬核'],
  },
  {
    id: 'coop',
    index: '06',
    code: 'TWIN RUINS',
    title: '双人遗迹',
    genre: '协作解谜',
    duration: '约 90 秒',
    objective: '与明确标记的 BOT 搭档同时压住机关，打开遗迹大门。',
    description:
      '向 BOT 下达等待指令，再走上另一块压力板。两端状态同步后石门开启，最后共同取得遗迹核心。',
    packages: ['net', 'relay', 'scene', 'quest'],
    variants: ['BOT 搭档', '80 ms 模拟', '160 ms 模拟'],
  },
] as const;

export function DemoLab() {
  const [sceneId, setSceneId] = useState<SceneId>('meadow');
  const [variant, setVariant] = useState(0);
  const activeScene = useMemo(
    () => SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0],
    [sceneId],
  );

  const selectScene = (nextScene: SceneId) => {
    setSceneId(nextScene);
    setVariant(0);
  };

  return (
    <main className="demo-page">
      <header className="demo-intro">
        <div className="demo-kicker">
          <span>PLAYABLE GAME SCENES</span>
          <span>6 VERTICAL SLICES</span>
          <span>BUILT WITH OVERWORLD</span>
        </div>
        <div className="demo-intro-grid">
          <h1>从晨雾原野，<br />到午夜潜入。</h1>
          <div>
            <p>
              这里不解释框架有多少功能。选择一个场景，移动角色，完成目标。
              等你感受到玩法成立，再去看它背后的系统如何组合。
            </p>
            <div className="demo-intro-links">
              <span>WASD / 方向键移动 · E / 空格行动 · 拖拽镜头</span>
              <Link href="/docs/starter">从 Starter 开始 →</Link>
            </div>
          </div>
        </div>
      </header>

      <section className={`demo-lab demo-lab-${sceneId}`} aria-label="Overworld 可玩游戏场景">
        <nav className="demo-modes" aria-label="选择游戏场景">
          {SCENES.map((scene) => (
            <button
              type="button"
              key={scene.id}
              aria-pressed={sceneId === scene.id}
              onClick={() => selectScene(scene.id)}
            >
              <span>{scene.index}</span>
              <strong>{scene.code}</strong>
              <small>{scene.title}</small>
            </button>
          ))}
        </nav>

        <div className="demo-stage">
          <GameStage sceneId={sceneId} variant={variant} />

          <div className="demo-stage-head">
            <span>{activeScene.code} / {activeScene.genre}</span>
            <span className="demo-live"><i /> PLAY NOW</span>
          </div>

          <div className="demo-stage-controls">
            <span>SCENE VARIANT</span>
            <div>
              {activeScene.variants.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={variant === index ? 'is-active' : ''}
                  aria-pressed={variant === index}
                  onClick={() => setVariant(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>

        <article className="demo-brief">
          <div className="demo-brief-index">{activeScene.index} / 06</div>
          <div>
            <p className="demo-brief-eyebrow">{activeScene.genre} · {activeScene.duration}</p>
            <h2>{activeScene.title}</h2>
            <p className="demo-objective-label">本局目标</p>
            <p className="demo-objective">{activeScene.objective}</p>
            <p className="demo-brief-copy">{activeScene.description}</p>
          </div>
          <div className="demo-package-links">
            <span>幕后系统</span>
            {activeScene.packages.map((packageName) => (
              <Link href={`/docs/packages/${packageName}`} key={packageName}>
                @{packageName}
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="demo-scenes" aria-labelledby="demo-scenes-title">
        <div className="demo-section-label">SIX PLAYABLE SLICES</div>
        <div className="demo-coverage-head">
          <h2 id="demo-scenes-title">不是技术样板，是六个能完成的小目标。</h2>
          <p>
            每个场景都有自己的地图、规则、失败条件和完成状态。框架能力只在玩法真正需要时出现。
          </p>
        </div>
        <div className="demo-scene-list">
          {SCENES.map((scene) => (
            <button type="button" key={scene.id} onClick={() => {
              selectScene(scene.id);
              document.querySelector('.demo-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              <span>{scene.index}</span>
              <div><strong>{scene.title}</strong><small>{scene.genre}</small></div>
              <p>{scene.objective}</p>
              <i>{scene.duration}</i>
            </button>
          ))}
        </div>
      </section>

      <footer className="demo-footer">
        <div>
          <span>BUILD YOUR OWN</span>
          <h2>下一段游戏，由你来定义。</h2>
        </div>
        <div>
          <p>从一段能完成的核心循环开始，再把它扩展成你的世界。</p>
          <Link href="/docs/starter">
            打开 Starter 指南 <span aria-hidden="true">→</span>
          </Link>
          <Link href="/docs/architecture">
            理解组合架构 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </footer>
    </main>
  );
}
